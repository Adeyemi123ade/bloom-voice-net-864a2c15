import CallSession from "@/pages/CallScreen";
import { useActiveCall } from "@/lib/activeCall";

/**
 * Mounted once in App, outside <Routes>, so an ongoing call isn't torn down
 * when the user navigates. Keyed by call id so each call gets a fresh session.
 */
export default function ActiveCallHost() {
  const call = useActiveCall();
  if (!call) return null;
  return <CallSession key={call.callId} params={call} />;
}
