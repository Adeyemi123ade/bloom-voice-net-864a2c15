import CallSession from "@/pages/CallScreen";
import { useCalls } from "@/lib/activeCall";

/**
 * Mounted once in App, outside <Routes>, so an ongoing call isn't torn down
 * when the user navigates. One session per call (keyed by call id): normally
 * one, two when a call is on hold while another is answered. Only the
 * foreground call shows its screen; a held call keeps its connection, silent.
 */
export default function ActiveCallHost() {
  const { calls, foregroundId } = useCalls();
  return (
    <>
      {calls.map((c) => (
        <CallSession
          key={c.callId}
          params={c}
          foreground={c.callId === foregroundId}
          held={c.held}
        />
      ))}
    </>
  );
}
