// Authenticated endpoint. Verifies a device login OTP. On success:
//  - Removes any existing device binding for OTHER users on this device
//    (the "second account on same phone" takeover), so the previous user is
//    effectively signed out next time their app starts.
//  - Adds/updates the trusted-device row for the current user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const { device_id, code, device_label, platform } = await req.json();
    const deviceId = typeof device_id === "string" ? device_id.trim() : "";
    const cleanCode = typeof code === "string" ? code.replace(/\D/g, "") : "";
    const plat: "mobile" | "web" = platform === "mobile" ? "mobile" : "web";
    if (!deviceId || cleanCode.length !== 6) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const codeHash = await sha256(cleanCode);

    const { data: challenge } = await admin
      .from("device_login_challenges")
      .select("*")
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!challenge) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (challenge.attempts >= 5) {
      await admin.from("device_login_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id);
      return new Response(JSON.stringify({ error: "too_many_attempts" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (challenge.code_hash !== codeHash) {
      await admin.from("device_login_challenges")
        .update({ attempts: challenge.attempts + 1 })
        .eq("id", challenge.id);
      return new Response(JSON.stringify({ error: "wrong_code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success — consume the challenge.
    await admin.from("device_login_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);

    // Mobile takeover: remove any other user's binding on this same phone.
    if (plat === "mobile") {
      await admin.from("user_devices")
        .delete()
        .eq("device_id", deviceId)
        .neq("user_id", user.id);
    }

    // Web sign-in takes over from mobile only: drop the user's mobile bindings.
    // Do NOT revoke all auth sessions here, because the admin API can't know
    // which browser session is the current one in this function context; doing
    // so can also destroy the browser session that just passed verification.
    let mobileSignedOut = false;
    if (plat === "web") {
      const { data: mobileRows } = await admin
        .from("user_devices")
        .select("id")
        .eq("user_id", user.id)
        .eq("platform", "mobile");
      if (mobileRows && mobileRows.length > 0) {
        await admin.from("user_devices")
          .delete()
          .eq("user_id", user.id)
          .eq("platform", "mobile");
        mobileSignedOut = true;
      }
    }

    // Trust this device for the current user.
    await admin.from("user_devices").upsert({
      user_id: user.id,
      device_id: deviceId,
      device_label: typeof device_label === "string" ? device_label.slice(0, 80) : null,
      platform: plat,
      last_verified_at: new Date().toISOString(),
    }, { onConflict: "user_id,device_id" });

    return new Response(JSON.stringify({ ok: true, mobile_signed_out: mobileSignedOut }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
