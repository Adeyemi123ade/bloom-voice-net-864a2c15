// Authenticated endpoint. Called by the client right after sign-in when the
// device is unknown (or when a different account is currently bound to it).
// Generates a 6-digit code, stores its hash, and emails it to the user.
//
// Returns: { reason: 'new_device' | 'device_takeover' | 'trusted', other_display_name?: string }
// 'trusted' means no challenge is needed — the client can proceed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sixDigit() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Rate limit (kept in this file so it deploys from the dashboard as one file;
// same logic as _shared/rateLimit.ts).
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function withinLimit(admin: RpcClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    _key: key,
    _max_count: max,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("check_rate_limit error:", error.message);
    return true;
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { device_id, device_label, platform, dry_run } = await req.json();
    const deviceId = typeof device_id === "string" ? device_id.trim() : "";
    const plat: "mobile" | "web" = platform === "mobile" ? "mobile" : "web";
    const dryRun = dry_run === true;
    if (!deviceId || deviceId.length > 128) {
      return new Response(JSON.stringify({ error: "invalid_device" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipientEmail = String(user.email ?? "").trim().toLowerCase();
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "email_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey);

    // Mobile-only shortcut: a trusted device skips the OTP. Web ALWAYS verifies.
    if (plat === "mobile") {
      const { data: trusted } = await admin
        .from("user_devices")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_id", deviceId)
        .maybeSingle();
      if (trusted) {
        await admin.from("user_devices")
          .update({ last_verified_at: new Date().toISOString() })
          .eq("id", trusted.id);
        return new Response(JSON.stringify({ reason: "trusted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Determine reason for the prompt the user will see.
    // - web with an active mobile device for this same account ➜ "web_mobile_active"
    //   (signing in on web will sign the mobile out)
    // - mobile with another user already on this phone ➜ "device_takeover"
    // - otherwise ➜ "new_device"
    let reason: "new_device" | "device_takeover" | "web_mobile_active" = "new_device";
    let otherDisplayName: string | null = null;

    if (plat === "web") {
      const { data: mobileBinding } = await admin
        .from("user_devices")
        .select("id, device_label")
        .eq("user_id", user.id)
        .eq("platform", "mobile")
        .order("last_verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mobileBinding) {
        reason = "web_mobile_active";
        otherDisplayName = mobileBinding.device_label || "your phone";
      }
    } else {
      const { data: otherRows } = await admin.rpc("device_is_bound_to_other", {
        _device_id: deviceId,
        _user_id: user.id,
      });
      const other = Array.isArray(otherRows) ? otherRows[0] : null;
      if (other) {
        reason = "device_takeover";
        otherDisplayName = other.other_display_name ?? null;
      }
    }


    // If this is just a probe ("is the device trusted? what would the prompt be?"),
    // do NOT create a challenge or send an email. The client will call back
    // without dry_run after the user explicitly confirms they want to continue.
    if (dryRun) {
      return new Response(
        JSON.stringify({ reason, other_display_name: otherDisplayName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Each call emails a new code: 5 per 15 minutes and 20 a day per person.
    const sendAllowed =
      (await withinLimit(admin, `request-device-otp:15m:${user.id}`, 5, 900)) &&
      (await withinLimit(admin, `request-device-otp:1d:${user.id}`, 20, 86400));
    if (!sendAllowed) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the challenge.
    const code = sixDigit();
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Invalidate any pending challenges for this user+device.
    await admin
      .from("device_login_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .is("consumed_at", null);

    const { error: insertErr } = await admin.from("device_login_challenges").insert({
      user_id: user.id,
      email: recipientEmail,
      device_id: deviceId,
      code_hash: codeHash,
      reason,
      expires_at: expiresAt,
    });
    if (insertErr) {
      return new Response(JSON.stringify({ error: "challenge_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the code via email through the shared queue infrastructure so it
    // benefits from retries and deliverability tracking.
    const subject =
      reason === "device_takeover"
        ? "ChiChat: confirm new sign-in on this phone"
        : reason === "web_mobile_active"
          ? "ChiChat: confirm sign-in on the web"
          : "ChiChat: verify this device";
    const intro =
      reason === "device_takeover"
        ? "Someone (hopefully you) is trying to sign in to ChiChat on a phone that's already in use by another account. Use this code to continue:"
        : reason === "web_mobile_active"
          ? "Your ChiChat account is currently signed in on a phone. Continuing on the web will sign that phone out. Use this code to confirm it's you:"
          : "We noticed a sign-in to your ChiChat account on a new device. Enter this code in the app to confirm it's you:";

    const display = `${code.slice(0, 3)} ${code.slice(3)}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#121212;padding:32px;max-width:560px;margin:auto">
        <h1 style="font-size:20px;margin:0 0 16px">ChiChat verification code</h1>
        <p style="font-size:15px;line-height:1.5;color:#333">${intro}</p>
        <div style="background:#0B8F6C;color:#fff;border-radius:14px;padding:20px 32px;text-align:center;margin:20px 0">
          <div style="font-size:36px;font-weight:bold;letter-spacing:6px">${display}</div>
        </div>
        <p style="font-size:13px;color:#8A8A8A">This code expires in 10 minutes. If this wasn't you, ignore this email and change your password right away.</p>
      </div>`;
    const text = `${intro}\n\nYour code: ${code}\n\nIt expires in 10 minutes.`;

    const messageId = crypto.randomUUID();

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: `device_${reason}`,
      recipient_email: recipientEmail,
      status: "pending",
    });
    await admin.rpc("enqueue_email", {
      queue_name: "auth_emails",
      payload: {
        message_id: messageId,
        to: recipientEmail,
        from: "ChiChat <noreply@chichatapp.com>",
        subject,
        html,
        text,
        label: `device_${reason}`,
        queued_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        reason,
        other_display_name: otherDisplayName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
