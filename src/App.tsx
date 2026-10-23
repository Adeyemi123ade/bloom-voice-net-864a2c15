import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Register from "./pages/Register.tsx";
import Login from "./pages/Login.tsx";
import Welcome from "./pages/Welcome.tsx";
import Home from "./pages/Home.tsx";
import ChatRoom from "./pages/ChatRoom.tsx";
import CallRoute from "./pages/CallRoute.tsx";
import Contacts from "./pages/Contacts.tsx";
import Profile from "./pages/Profile.tsx";
import Settings from "./pages/Settings.tsx";
import PhoneSettings from "./pages/PhoneSettings.tsx";
import ChatBackup from "./pages/ChatBackup.tsx";
import AppSettings from "./pages/AppSettings.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import VerifyEmail from "./pages/VerifyEmail.tsx";
import VerifyResetCode from "./pages/VerifyResetCode.tsx";
import VerifyDevice from "./pages/VerifyDevice.tsx";
import GoogleReturn from "./pages/GoogleReturn.tsx";
import OutboundCall from "./pages/OutboundCall.tsx";
import BlockedPeople from "./pages/BlockedPeople.tsx";
import NewContact from "./pages/NewContact.tsx";
import InviteFriends from "./pages/InviteFriends.tsx";
import MicTest from "./pages/MicTest.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsOfService from "./pages/TermsOfService.tsx";
import MessageNotifier from "./components/MessageNotifier.tsx";
import PresenceHeartbeat from "./components/PresenceHeartbeat.tsx";
import IncomingCallScreen from "./components/IncomingCallScreen.tsx";
import DeviceGate from "./components/DeviceGate.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import BackButtonGuard from "./components/BackButtonGuard.tsx";
import GoogleOAuthReturnListener from "./components/GoogleOAuthReturnListener.tsx";
import ActiveCallHost from "./components/call/ActiveCallHost.tsx";
import CallRecovery from "./components/call/CallRecovery.tsx";
import NativeNavigateBridge from "./components/NativeNavigateBridge.tsx";
import AndroidAppPrompt from "./components/AndroidAppPrompt.tsx";
import AccountGuard from "./components/AccountGuard.tsx";
import RouteMemory from "./components/RouteMemory.tsx";
import SendFeedback from "./pages/SendFeedback.tsx";
import Admin from "./pages/Admin.tsx";
import AccountSuspended from "./pages/AccountSuspended.tsx";
import OfflineBanner from "@/components/OfflineBanner";
import DeleteAccountInfo from "./pages/DeleteAccountInfo.tsx";
import AppGoogleHandoff from "./components/AppGoogleHandoff.tsx";
import { isAppGoogleStart, pendingAppGoogleReturn } from "@/lib/appGoogleHandoff";

const queryClient = new QueryClient();

// Browser tab signing in to Google for the Android app (appGoogleHandoff.ts):
// it only passes through to Google, or hands the result back to the app.
const appGoogleResult = pendingAppGoogleReturn();
const appGooglePassThrough = !appGoogleResult && isAppGoogleStart();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {appGoogleResult ? (
            <AppGoogleHandoff result={appGoogleResult} />
          ) : appGooglePassThrough ? null : (
          <BrowserRouter>
            <AndroidAppPrompt />
            <AccountGuard />
            <RouteMemory />
            <GoogleOAuthReturnListener />
            <OfflineBanner />
            <NativeNavigateBridge />
            <DeviceGate>
              <BackButtonGuard />
              <MessageNotifier />
              <PresenceHeartbeat />
              <IncomingCallScreen />
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/google-return" element={<GoogleReturn />} />
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/chat/:id" element={<ChatRoom />} />
                  <Route path="/call/:id" element={<CallRoute />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/contacts/new" element={<NewContact />} />
                  <Route path="/invite" element={<InviteFriends />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/phone" element={<PhoneSettings />} />
                  <Route path="/settings/backup" element={<ChatBackup />} />
                  <Route path="/settings/app" element={<AppSettings />} />
                  <Route path="/settings/blocked" element={<BlockedPeople />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/verify-reset-code" element={<VerifyResetCode />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/verify-device" element={<VerifyDevice />} />
                  <Route path="/dial/:number" element={<OutboundCall />} />
                  <Route path="/mic-test" element={<MicTest />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/settings/feedback" element={<SendFeedback />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/account-suspended" element={<AccountSuspended />} />
                  <Route path="/delete-account" element={<DeleteAccountInfo />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </DeviceGate>
            {/* Outside <Routes> (and the sign-in gate, which can briefly show
                a loading screen) so an ongoing call survives navigation. */}
            <ErrorBoundary>
              <ActiveCallHost />
            </ErrorBoundary>
            <CallRecovery />
          </BrowserRouter>
          )}
        </TooltipProvider>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
