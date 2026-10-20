import { Link } from "react-router-dom";
import LegalPage, { LegalList, LegalSection } from "@/components/legal/LegalPage";

// Public route: /terms (see EXEMPT_ROUTES in DeviceGate.tsx). Must render
// for signed-out visitors and reviewers. Written around what ChiChat actually
// does today; update it when features (e.g. paid features) change.
export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="2026-10-21"
      other={{ to: "/privacy", label: "Privacy Policy" }}
    >
      <LegalSection title="Agreement to These Terms">
        <p>
          These Terms of Service govern your use of ChiChat, including the website at
          chichatapp.com and the ChiChat mobile app. By creating an account or using ChiChat, you
          agree to these terms and to our{" "}
          <Link to="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          . If you do not agree, do not use ChiChat.
        </p>
      </LegalSection>

      <LegalSection title="Who Can Use ChiChat">
        <p>
          You must be at least 13 years old, or the minimum age required in your country to use
          an online service without parental consent if that is higher. You must provide accurate
          registration details, including a phone number and email address you are entitled to
          use.
        </p>
      </LegalSection>

      <LegalSection title="Your Account">
        <p>
          You are responsible for keeping your password secure and for activity on your account.
          Tell us promptly at support@chichatapp.com if you believe your account has been used
          without your permission. You may delete your account at any time from Settings.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable Use">
        <p>You agree not to use ChiChat to:</p>
        <LegalList
          items={[
            "Break any law or encourage others to do so.",
            "Harass, threaten, bully or abuse anyone, or share content that sexually exploits or endangers children.",
            "Send spam, bulk or automated messages or calls, or unsolicited advertising.",
            "Impersonate another person or misrepresent who you are.",
            "Share content that infringes someone else's rights, including copyright and privacy.",
            "Distribute malware, or attempt to access, probe, disrupt or overload ChiChat's systems or other users' accounts.",
            "Collect information about other users, including by scraping or by checking phone numbers in bulk.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Reporting, Blocking and Enforcement">
        <p>
          You can block anyone from their chat or contact screen, and report a person or a single
          message from the same menus. A blocked person can't message or call you, or see your
          photo and last seen. People who aren't in your contacts reach you first as a message
          request, which you can accept, block or report.
        </p>
        <p>
          The ChiChat team reviews every report. If we find that someone broke these terms, we may
          warn them, limit what they can do, or suspend their account. A suspended person's email
          address and phone number can be kept on a block list so they can't simply register
          again. New accounts have limits on how many new chats and calls they can start, to stop
          spam.
        </p>
      </LegalSection>

      <LegalSection title="Child Safety">
        <p>
          ChiChat has zero tolerance for child sexual abuse and exploitation. Sharing, requesting
          or promoting such material, or using ChiChat to groom or contact a child for sexual
          purposes, is forbidden. Accounts involved are suspended permanently, the material is
          preserved only as required by law, and we report it to the relevant authorities,
          including the National Center for Missing &amp; Exploited Children (NCMEC) where
          applicable.
        </p>
        <p>
          To report a concern about child safety, use Report in the app or write to our child
          safety contact at{" "}
          <a href="mailto:techpath411@gmail.com" className="text-primary underline underline-offset-2">
            techpath411@gmail.com
          </a>
          . We act on these reports first.
        </p>
      </LegalSection>

      <LegalSection title="Your Content">
        <p>
          You own the messages, photos, voice notes and other content you send. You give ChiChat
          permission to store, transmit and display that content only as needed to operate the
          service, for example to deliver your messages to the people you send them to. You are
          responsible for the content you send.
        </p>
      </LegalSection>

      <LegalSection title="Contacts">
        <p>
          If you import contacts from your phone or Google account, you confirm that you are
          allowed to use those phone numbers for this purpose. We use them only as described in
          our Privacy Policy, to show you which of your contacts already use ChiChat.
        </p>
      </LegalSection>

      <LegalSection title="Calls and Emergency Services">
        <p>
          ChiChat is not a replacement for your ordinary mobile or landline phone service.{" "}
          <strong className="text-foreground">
            ChiChat does not support calls to emergency services and must not be relied on for
            them.
          </strong>{" "}
          In an emergency, use your phone's regular dialler.
        </p>
        <p>
          Call quality depends on your internet connection and on our communications providers,
          and calls may drop or fail.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Services">
        <p>
          ChiChat relies on third-party providers for hosting, sign-in, calling, email and, if you
          choose, Google sign-in and Google Contacts. Your use of a Google account is also subject
          to Google's own terms.
        </p>
      </LegalSection>

      <LegalSection title="Fees">
        <p>
          ChiChat is currently free to use. Your mobile carrier or internet provider may charge
          you for the data ChiChat uses. If we introduce paid features, we will tell you the price
          before you are charged anything.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and Termination">
        <p>
          We may suspend or close accounts that break these terms or put other users or the
          service at risk. You may stop using ChiChat and delete your account at any time.
        </p>
      </LegalSection>

      <LegalSection title="Service Changes and Availability">
        <p>
          We are continually improving ChiChat and may add, change or remove features. We aim to
          keep ChiChat available but cannot promise it will always be uninterrupted or error free.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers and Limitation of Liability">
        <p>
          ChiChat is provided "as is" and "as available". To the extent permitted by law, we make
          no warranties beyond those stated in these terms, and we are not liable for indirect or
          consequential losses arising from your use of ChiChat, such as lost data, missed calls or
          messages, or loss of business. Nothing in these terms limits any rights you have that
          cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="Changes to These Terms">
        <p>
          We may update these terms as ChiChat changes. We will show the new date at the top of
          this page and, for significant changes, tell you in the app. Continuing to use ChiChat
          after an update means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:support@chichatapp.com" className="text-primary underline underline-offset-2">
            support@chichatapp.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
