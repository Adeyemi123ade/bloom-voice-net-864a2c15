import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";

// Public route — see EXEMPT_ROUTES in DeviceGate.tsx. Must never depend on
// auth state: this page has to render for a signed-out visitor clicking the
// link on Register/Login, not just for an existing user reviewing it from
// Settings.
export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background text-foreground overflow-y-auto">
        <header className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border sticky top-0 bg-background z-10">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
            className="w-9 h-9 rounded-xl bg-secondary/60 hover:bg-secondary flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">Privacy Policy</h1>
        </header>

        <div className="flex-1 px-5 py-5 max-w-2xl mx-auto text-sm leading-relaxed text-foreground/90 space-y-6">
          <p className="text-xs text-muted-foreground">Last updated: 2026-09-15</p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Introduction</h2>
            <p>
              ChiChat provides messaging, voice, and video calling. This
              policy explains what information the app collects, why, and
              how it's handled. It describes ChiChat's actual implementation
              — it does not promise capabilities the app doesn't have.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Information We Collect</h2>
            <p>We collect only what's needed to provide the app's features:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account details you provide (name, email, phone number, password).</li>
              <li>Profile information you choose to add (display name, avatar).</li>
              <li>Messages and media you send through the app.</li>
              <li>Call metadata (who called whom, when, and for how long) and, only for phone/PSTN calls placed through the app, call routing information handled by our telephony provider.</li>
              <li>Device and diagnostic information (device ID, platform, push-notification token) used to deliver notifications and secure sign-in.</li>
              <li>Phone numbers from your device contacts or Google Contacts, only if you choose to sync or import them, used solely to show you which of your contacts are already on ChiChat.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Account Information</h2>
            <p>
              Your email or phone number, display name, and password (stored
              as a salted hash, never in plain text) are used to create and
              secure your account, sign you in, and let others find you to
              start a conversation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Contacts / Phone Number Information</h2>
            <p>
              If you import phone or Google contacts, your device sends the
              phone numbers to our servers only to check which ones already
              have a ChiChat account, so we can show you a match or offer to
              invite the rest. We do not read, store, or share the content
              of your address book beyond what's needed for this matching.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Messages and Communications</h2>
            <p>
              Messages are stored so they can be delivered to the recipient
              and kept as your conversation history, and are only visible to
              the participants of that conversation. Deleting a message or a
              conversation removes it according to the option you chose
              (for yourself, or for everyone in the chat).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Calls / Voice / Video Communication</h2>
            <p>
              Voice and video calls between ChiChat users are connected
              through our real-time media provider; ChiChat does not record
              these calls. Outbound calls to regular phone numbers are routed
              through our telephony provider under the same principle: only
              the call metadata needed to connect and log the call is
              retained.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">How Information Is Used</h2>
            <p>We use the information above only to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide and maintain the messaging and calling features.</li>
              <li>Authenticate you and keep your account secure.</li>
              <li>Deliver push notifications for messages and incoming calls.</li>
              <li>Show you which contacts already use ChiChat.</li>
              <li>Diagnose and fix technical problems.</li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Data Storage</h2>
            <p>
              Data is stored in our managed database and file storage
              infrastructure (Supabase), protected by access-control rules
              that restrict each account to its own data and to the
              conversations it participates in.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Third-Party Services</h2>
            <p>
              ChiChat relies on a small number of service providers to
              operate: a database/authentication provider, a real-time
              communications provider for calls, a transactional email
              provider for verification codes, and, where you opt in, Google
              (for Google sign-in and Google Contacts). Each only receives
              the minimum information needed to perform its specific
              function.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Account Deletion</h2>
            <p>
              You can permanently delete your account from Settings. This
              removes your profile, messages you sent, call history,
              device/push registrations, and connected-account tokens, and
              deletes your authentication record — freeing your email/phone
              for future use if you choose to sign up again.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Data Retention</h2>
            <p>
              We keep your data for as long as your account is active and
              for a reasonable period afterward to comply with legal
              obligations and resolve disputes, unless you delete your
              account sooner via the option described above.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Security</h2>
            <p>
              We use industry-standard measures — encrypted connections,
              access-control rules scoped to each account, and hashed
              passwords — to protect your information. No system is
              perfectly secure, and we encourage you to use a strong,
              unique password.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">User Rights</h2>
            <p>
              You can review and update your profile information at any
              time from Settings, and permanently delete your account and
              associated data as described above. If you have questions
              about your data, contact us using the details below.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Children's Privacy</h2>
            <p>
              ChiChat is not directed at children under 13, and we do not
              knowingly collect information from them. If you believe a
              child has created an account, contact us so we can remove it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Changes to This Policy</h2>
            <p>
              We may update this policy as the app changes. Material changes
              will be reflected here with an updated date at the top of this
              page.
            </p>
          </section>

          <section className="space-y-2 pb-6">
            <h2 className="text-base font-semibold">Contact / Support</h2>
            <p>
              Questions about this policy or your data can be sent to{" "}
              <a href="mailto:support@chichatapp.com" className="text-primary underline underline-offset-2">
                support@chichatapp.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </MobileFrame>
  );
}
