import { useEffect, useRef, useState } from "react";

/**
 * Capture someone reading the enrolment passage — by recording, or by
 * uploading a file they already made.
 *
 * Used both by a counsellor enrolling their own voice and by a companion
 * enrolling at the start of a session — the same act, so the same control.
 *
 * Recording is audio only: `getUserMedia({ audio: true })` never turns the
 * camera on. There is no reason to film somebody reading a paragraph, so the
 * permission prompt asks for the microphone alone.
 *
 * Upload accepts video as well as audio. People record themselves on whatever
 * is to hand — a phone, a laptop camera — and rejecting an mp4 because it has
 * a video track would be pedantry: the server extracts the audio either way.
 */

/** Below this the server rejects the recording anyway; warn before submitting. */
const MIN_SECONDS = 15;

/** Mirrors the server's allowlist in FileStorageService. */
const ACCEPTED = ".webm,.ogg,.wav,.mp3,.m4a,.mp4,audio/*,video/mp4,video/webm";

export default function VoiceRecorder({ onRecorded, disabled = false }) {
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  // Mirrors the `seconds` state. onstop fires from a closure created when
  // recording started, where the state variable is still 0 — a ref is the only
  // value that reads correctly at that point.
  const secondsRef = useRef(0);

  const [mode, setMode] = useState("record"); // "record" | "upload"
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [uploadedName, setUploadedName] = useState("");
  const [error, setError] = useState("");

  // Stop the microphone on unmount. Without this the browser's recording
  // indicator stays lit after navigating away, which reasonably makes people
  // think they are still being listened to.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // The browser chooses the container (webm on Chrome, mp4 on Safari),
        // so the type is read back off the recorder rather than assumed.
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        onRecorded(new File([blob], `voice.${extension}`, { type }), secondsRef.current);

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch {
      setError(
        "Could not access the microphone. Allow microphone access in your browser " +
          "and try again, or upload a recording instead."
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function clearCapture() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setUploadedName("");
    setSeconds(0);
    secondsRef.current = 0;
    onRecorded(null, 0);
  }

  function switchMode(next) {
    if (recording) stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearCapture();
    setError("");
    setMode(next);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    setUploadedName(file.name);

    // Duration is read from the decoded media rather than guessed, so the
    // "too short" warning is as accurate for an upload as for a recording.
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const duration = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0;
      setSeconds(duration);
      secondsRef.current = duration;
      onRecorded(file, duration);
    };
    probe.onerror = () => {
      // Unreadable in this browser does not mean unusable on the server —
      // ffmpeg handles more formats than a browser's media element does. So
      // the file is still submitted; only the duration hint is lost.
      setSeconds(0);
      secondsRef.current = 0;
      onRecorded(file, 0);
    };
    probe.src = url;
  }

  const hasCapture = Boolean(blobUrl);
  const tooShort = hasCapture && !recording && seconds > 0 && seconds < MIN_SECONDS;

  return (
    <div className="voice-recorder">
      {!hasCapture && (
        <div className="tab-switch">
          <button
            type="button"
            className={mode === "record" ? "tab active" : "tab"}
            onClick={() => switchMode("record")}
            disabled={disabled}
          >
            Record now
          </button>
          <button
            type="button"
            className={mode === "upload" ? "tab active" : "tab"}
            onClick={() => switchMode("upload")}
            disabled={disabled}
          >
            Upload a recording
          </button>
        </div>
      )}

      {!hasCapture && mode === "record" && (
        <div className="voice-recorder-controls">
          {!recording ? (
            <button type="button" className="btn-primary" onClick={start} disabled={disabled}>
              Start recording
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={stop}>
              Stop recording
            </button>
          )}

          {recording && (
            <span className="recording-indicator">
              <span className="recording-dot" aria-hidden="true" />
              Recording — {formatTime(seconds)}
            </span>
          )}
        </div>
      )}

      {!hasCapture && mode === "upload" && (
        <div className="upload-zone">
          <input type="file" accept={ACCEPTED} onChange={handleFile} disabled={disabled} />
          <p className="muted small">
            An audio or video file of the passage being read aloud. Only the audio is
            used — any picture is discarded.
          </p>
        </div>
      )}

      {hasCapture && (
        <div className="voice-recorder-playback">
          <p className="muted">
            {uploadedName ? (
              <>
                Selected <strong>{uploadedName}</strong>
                {seconds > 0 && <> — {formatTime(seconds)}</>}.
              </>
            ) : (
              <>Recorded {formatTime(seconds)}.</>
            )}{" "}
            Play it back and check the voice is clear before submitting.
          </p>
          <audio src={blobUrl} controls />
          <button type="button" className="btn-link" onClick={clearCapture}>
            {uploadedName ? "Choose a different file" : "Record again"}
          </button>
        </div>
      )}

      {tooShort && (
        <div className="alert alert-warning">
          That is only {formatTime(seconds)}. Read the whole passage — anything under
          about {MIN_SECONDS} seconds does not contain enough speech to recognise a
          voice, and will be rejected.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
