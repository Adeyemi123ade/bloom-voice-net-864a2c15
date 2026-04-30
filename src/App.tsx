import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Register from "./pages/Register.tsx";
import Login from "./pages/Login.tsx";
import Welcome from "./pages/Welcome.tsx";
import Home from "./pages/Home.tsx";
import ChatRoom from "./pages/ChatRoom.tsx";
import CallScreen from "./pages/CallScreen.tsx";
import Contacts from "./pages/Contacts.tsx";
import Profile from "./pages/Profile.tsx";
import Settings from "./pages/Settings.tsx";
import PhoneSettings from "./pages/PhoneSettings.tsx";
import ChatBackup from "./pages/ChatBackup.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import VerifyEmail from "./pages/VerifyEmail.tsx";
import VerifyResetCode from "./pages/VerifyResetCode.tsx";
import OutboundCall from "./pages/OutboundCall.tsx";
import NewContact from "./pages/NewContact.tsx";
import MessageNotifier from "./components/MessageNotifier.tsx";
import IncomingCallScreen from "./components/IncomingCallScreen.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <MessageNotifier />
            <IncomingCallScreen />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/home" element={<Home />} />
              <Route path="/chat/:id" element={<ChatRoom />} />
              <Route path="/call/:id" element={<CallScreen />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/new" element={<NewContact />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/phone" element={<PhoneSettings />} />
              <Route path="/settings/backup" element={<ChatBackup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify-reset-code" element={<VerifyResetCode />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/dial/:number" element={<OutboundCall />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
