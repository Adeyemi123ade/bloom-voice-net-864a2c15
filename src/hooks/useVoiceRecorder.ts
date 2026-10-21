import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { pickRecordingMimeType, baseMimeType } from "@/lib/audioMime";
import { checkMicPrerequisites, describeMicError } from "@/lib/micPermission";
import { isVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { transcribeRecording } from "@/lib/transcribe";
import { useLanguage } from "@/lib/i18n/context";

/**
 * Voice note recording for the chat room: start, stop (send, cancel, or
 * turn into text), the timer and the live stream for the level bar.
 * Moved out of src/pages/ChatRoom.tsx unchanged; sending the recorded
 * voice note (uploadVoice) stays in the chat room, which owns the messages.
 */
export function useVoiceRecorder({
  uploadVoice,
  setText,
}: {
  uploadVoice: (blob: Blob) => Promise<void>;
  setText: React.Dispatch<React.SetStateAction<string>>;
}) {
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // Lets the automatic update wait until a voice note is finished.
  useEffect(() => {
    document.body.dataset.recording = recording ? "true" : "false";
    return () => {
      document.body.dataset.recording = "false";
    };
  }, [recording]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const recMimeTypeRef = useRef<string>("audio/webm");

  const startRecording = async () => {
    const prereqError = checkMicPrerequisites();
    if (prereqError) {
      toast({ title: t("chat.cantRecord"), description: prereqError, variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      // Store the bare type (no ";codecs=..." parameter) — that parameter is
      // only meaningful to MediaRecorder for picking a codec, not to the
      // Blob that gets uploaded and later played back/transcribed.
      recMimeTypeRef.current = baseMimeType(rec.mimeType || mimeType || "audio/webm");
      recChunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && recChunks.current.push(e.data);
      // onstop is (re)assigned by stopRecording right before it's called, based
      // on which button ended the recording — send as a voice note, transcribe
      // to text, or discard. No default handler needed here.
      rec.start();
      recorderRef.current = rec;
      recStreamRef.current = stream;
      setRecording(true);
      setRecSec(0);
      recTimer.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch (e) {
      const { title, description } = describeMicError(e);
      toast({ title, description, variant: "destructive" });
    }
  };
  const stopRecording = (mode: "send" | "cancel" | "transcribe" = "send") => {
    const r = recorderRef.current;
    if (!r) return;
    r.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
      if (recTimer.current) window.clearInterval(recTimer.current);
      const blob = new Blob(recChunks.current, { type: recMimeTypeRef.current });
      setRecSec(0);
      if (mode === "send") await uploadVoice(blob);
      else if (mode === "transcribe") await transcribeAndFill(blob);
    };
    r.stop();
    setRecording(false);
  };
  const transcribeAndFill = async (blob: Blob) => {
    if (blob.size === 0 || !isVoiceTranscribeEnabled()) return;
    setTranscribing(true);
    try {
      const transcript = await transcribeRecording(blob);
      if (!transcript) {
        toast({
          title: t("chat.heardNothing"),
          description: t("chat.recordCloser"),
          variant: "destructive",
        });
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    } catch (e) {
      toast({
        title: t("chat.transcribeFailed"),
        description: t("auth.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };

  return { recording, transcribing, recSec, recStreamRef, startRecording, stopRecording };
}
