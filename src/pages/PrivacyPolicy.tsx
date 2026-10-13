import LegalPage, { LegalList, LegalSection } from "@/components/legal/LegalPage";

// Public route: /privacy (see EXEMPT_ROUTES in DeviceGate.tsx). Must render
// for signed-out visitors and reviewers. Describes ChiChat's actual
// implementation; it does not promise capabilities the app doesn't have.
export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="2026-10-13"
      other={{ to: "/terms", label: "Terms of Service" }}
    >
      <LegalSection title="Introduction">
        <p>
          ChiChat provides messaging, voice, and video calling. This policy explains what
          information the app collects, why, and how it's handled. It describes ChiChat's
          actual implementation — it does not promise capabilities the app doesn't have.
        </p>
      </LegalSection>

      <LegalSection title="Information We Collect">
        <p>We collect only what's needed to provide the app's features:</p>
        <LegalList
          items={[
            "Account details you provide (name, email, phone number, password).",
            "Profile information you choose to add (display name, avatar).",
            "Messages and media you send through the app.",
            "Call metadata (who called whom, when, and for how long) and, only for phone/PSTN calls placed through the app, call routing information handled by our telephony provider.",
            "Device and diagnostic information (device ID, platform, push-notification token) used to deliver notifications and secure sign-in.",
            "Phone numbers from your device contacts or Google Contacts, only if you choose to sync or import them, used solely to show you which of your contacts are already on ChiChat.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Account Information">
        <p>
          Your email or phone number, display name, and password (stored as a salted hash, never
          in plain text) are used to create and secure your account, sign you in, and let others
          find you to start a conversation.
        </p>
      </LegalSection>

      <LegalSection title="Contacts / Phone Number Information">
        <p>
          If you import phone or Google contacts, your device sends the phone numbers to our
          servers only to check which ones already have a ChiChat account, so we can show you a
          match or offer to invite the rest. We do not read, store, or share the content of your
          address book beyond what's needed for this matching.
        </p>
      </LegalSection>

      <LegalSection title="Google User Data">
        <p>
          If you choose to connect your Google account, ChiChat requests access to your Google
          Contacts and your Google account email address. We use this data only to:
        </p>
        <LegalList
          items={[
            "Show your Google contacts inside ChiChat and indicate which of them already use ChiChat.",
            "Save a new contact to your Google Contacts when you choose \"Save to Google Contacts\".",
            "Show which Google account is connected.",
          ]}
        />
        <p>
          The access tokens Google issues are stored with your ChiChat account so the app can
          refresh your contacts, and are deleted when you delete your ChiChat account. You can
          also revoke ChiChat's access at any time from your Google Account's security settings.
          We do not sell Google user data, use it for advertising, or share it with third
          parties, and no person at ChiChat reads it.
        </p>
        <p>
          ChiChat's use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection title="Messages and Communications">
        <p>
          Messages are stored so they can be delivered to the recipient and kept as your
          conversation history, and are only visible to the participants of that conversation.
          Deleting a message or a conversation removes it according to the option you chose (for
          yourself, or for everyone in the chat).
        </p>
      </LegalSection>

      <LegalSection title="Calls / Voice / Video Communication">
        <p>
          Voice and video calls between ChiChat users are connected through our real-time media
          provider; ChiChat does not record these calls. Outbound calls to regular phone numbers
          are routed through our telephony provider under the same principle: only the call
          metadata needed to connect and log the call is retained.
        </p>
      </LegalSection>

      <LegalSection title="How Information Is Used">
        <p>We use the information above only to:</p>
        <LegalList
          items={[
            "Provide and maintain the messaging and calling features.",
            "Authenticate you and keep your account secure.",
            "Deliver push notifications for messages and incoming calls.",
            "Show you which contacts already use ChiChat.",
            "Diagnose and fix technical problems.",
          ]}
        />
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="Data Storage">
        <p>
          Data is stored in our managed database and file storage infrastructure (Supabase),
          protected by access-control rules that restrict each account to its own data and to the
          conversations it participates in.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Services">
        <p>
          ChiChat relies on a small number of service providers to operate: a
          database/authentication provider, a real-time communications provider for calls, a
          transactional email provider for verification codes, and, where you opt in, Google (for
          Google sign-in and Google Contacts). Each only receives the minimum information needed
          to perform its specific function.
        </p>
      </LegalSection>

      <LegalSection title="Account Deletion">
        <p>
          You can permanently delete your account from Settings. This removes your profile,
          messages you sent, call history, device/push registrations, and connected-account
          tokens, and deletes your authentication record — freeing your email/phone for future use
          if you choose to sign up again.
        </p>
      </LegalSection>

      <LegalSection title="Data Retention">
        <p>
          We keep your data for as long as your account is active and for a reasonable period
          afterward to comply with legal obligations and resolve disputes, unless you delete your
          account sooner via the option described above.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We use industry-standard measures — encrypted connections, access-control rules scoped
          to each account, and hashed passwords — to protect your information. No system is
          perfectly secure, and we encourage you to use a strong, unique password.
        </p>
      </LegalSection>

      <LegalSection title="User Rights">
        <p>
          You can review and update your profile information at any time from Settings, and
          permanently delete your account and associated data as described above. If you have
          questions about your data, contact us using the details below.
        </p>
      </LegalSection>

      <LegalSection title="Children's Privacy">
        <p>
          ChiChat is not directed at children under 13, and we do not knowingly collect
          information from them. If you believe a child has created an account, contact us so we
          can remove it.
        </p>
      </LegalSection>

      <LegalSection title="Changes to This Policy">
        <p>
          We may update this policy as the app changes. Material changes will be reflected here
          with an updated date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection title="Contact / Support">
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href="mailto:support@chichatapp.com" className="text-primary underline underline-offset-2">
            support@chichatapp.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
