import { useEffect, useRef, useState } from "react";

/**
 * Minimal MediaRecorder wrapper for voice notes.
 * Returns a Blob on stop so the caller can upload it directly.
 */
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      cleanupStream();
    },
    [],
  );

  const start = async () => {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice notes aren't supported in this browser");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        cleanupStream();
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        resolveRef.current?.(blob);
        resolveRef.current = null;
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setIsRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);

      return true;
    } catch {
      setError("Microphone permission was denied");
      cleanupStream();
      return false;
    }
  };

  /** Resolves with the recorded Blob (or null if nothing was captured). */
  const stop = () =>
    new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      recorder.stop();
    });

  const cancel = () => {
    const recorder = recorderRef.current;
    resolveRef.current = null;
    if (recorder && recorder.state === "recording") recorder.stop();
    chunksRef.current = [];
    cleanupStream();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setSeconds(0);
  };

  return { isRecording, seconds, error, start, stop, cancel };
}
