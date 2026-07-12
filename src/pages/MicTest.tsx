import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Play, Square, ArrowLeft, Volume2 } from "lucide-react";

export default function MicTest() {
  const navigate = useNavigate();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [permissionState, setPermissionState] = useState<string>("unknown");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Check permission status proactively
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          setPermissionState(status.state);
          status.onchange = () => setPermissionState(status.state);
        })
        .catch(() => setPermissionState("unsupported"));
    }
  }, []);

  // Start microphone and visualiser
  const startMic = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(s);
      setPermissionState("granted");

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(s);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVolume(avg);
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Microphone permission denied. Please allow mic access in your browser settings.");
        setPermissionState("denied");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found on this device.");
      } else if (err.name === "NotReadableError") {
        setError("Microphone is busy in another app. Close the other app and try again.");
      } else {
        setError(err.message || "Could not access microphone.");
      }
    }
  };

  const stopMic = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    stream?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    setStream(null);
    setVolume(0);
  };

  // Recording
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setAudioURL(URL.createObjectURL(blob));
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setAudioURL(null);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      stopMic();
      if (audioURL) URL.revokeObjectURL(audioURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const volumeBars = Array.from({ length: 20 }, (_, i) => {
    const threshold = (i + 1) * (255 / 20);
    const active = volume >= threshold;
    return (
      <div
        key={i}
        className={`w-2 rounded-full transition-all duration-75 ${
          active ? "bg-green-500" : "bg-zinc-700"
        }`}
        style={{ height: `${12 + i * 3}px` }}
      />
    );
  });

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-400 mb-6">
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      <h1 className="text-2xl font-bold mb-2">Microphone Test</h1>
      <p className="text-zinc-400 text-base mb-6">
        Test your microphone and speaker before making calls.
      </p>

      {/* Permission status */}
      <div className="bg-zinc-900 rounded-xl p-4 mb-4">
        <p className="text-base text-zinc-400">Microphone permission:</p>
        <p
          className={`text-lg font-semibold capitalize ${
            permissionState === "granted"
              ? "text-green-500"
              : permissionState === "denied"
              ? "text-red-500"
              : "text-yellow-500"
          }`}
        >
          {permissionState}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-4 text-red-300 text-base">
          {error}
        </div>
      )}

      {/* Volume visualiser */}
      {stream && (
        <div className="bg-zinc-900 rounded-xl p-6 mb-4 flex flex-col items-center">
          <p className="text-base text-zinc-400 mb-4">Speak now — watch the bars move</p>
          <div className="flex items-end gap-1 h-24">{volumeBars}</div>
          <p className="text-base text-zinc-500 mt-3">
            {volume > 10 ? "Microphone is picking up sound!" : "Say something..."}
          </p>
        </div>
      )}

      {/* Record / playback */}
      {stream && (
        <div className="bg-zinc-900 rounded-xl p-6 mb-4 flex flex-col items-center gap-4">
          <p className="text-base text-zinc-400">Record a short clip and play it back</p>
          {!recording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-full font-medium"
            >
              <Mic className="w-5 h-5" />
              Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-full font-medium animate-pulse"
            >
              <Square className="w-5 h-5" />
              Stop Recording
            </button>
          )}

          {audioURL && (
            <div className="w-full flex flex-col items-center gap-3">
              <audio controls src={audioURL} className="w-full" />
              <p className="text-base text-green-400 flex items-center gap-1">
                <Volume2 className="w-4 h-4" />
                Can you hear your recording? If yes, mic & speaker both work.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main action button */}
      <div className="mt-auto">
        {!stream ? (
          <button
            onClick={startMic}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-semibold text-lg"
          >
            <Mic className="w-6 h-6" />
            Start Microphone Test
          </button>
        ) : (
          <button
            onClick={stopMic}
            className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white py-4 rounded-xl font-semibold text-lg"
          >
            <MicOff className="w-6 h-6" />
            Stop Test
          </button>
        )}
      </div>
    </div>
  );
}
