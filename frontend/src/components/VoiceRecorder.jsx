import { useEffect, useRef, useState } from "react";

/**
 * Record someone reading the enrollment passage.
 *
 * Used both by a counselor enrolling their own voice and by a companion
 * enrolling at the start of a session — the same act, so the same control.
 *
 * Audio only: `getUserMedia({ audio: true })` never turns the camera on. The
 * passage takes about a minute to read and there is no reason to film somebody
 * doing it, so the permission prompt asks for the microphone alone.
 */

/** Below this the server rejects the recording anyway; warn before submitting. */
const MIN_SECONDS = 15;

export default function VoiceRecorder({ onRecorded, disabled = false }) {
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
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
        // so the type is read back off the recorder rather than assumed — the
        // server validates the extension and a wrong guess would be rejected.
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        onRecorded(new File([blob], `voice.${extension}`, { type }), seconds);

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        "Could not access the microphone. Allow microphone access in your browser " +
          "and try again."
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function reset() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setSeconds(0);
    onRecorded(null, 0);
  }

  const tooShort = !recording && blobUrl && seconds < MIN_SECONDS;

  return (
    <div className="voice-recorder">
      {!blobUrl && (
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

      {blobUrl && (
        <div className="voice-recorder-playback">
          <p className="muted">
            Recorded {formatTime(seconds)}. Play it back and check you can hear yourself
            clearly before submitting.
          </p>
          <audio src={blobUrl} controls />
          <button type="button" className="btn-link" onClick={reset}>
            Record again
          </button>
        </div>
      )}

      {tooShort && (
        <div className="alert alert-warning">
          That was only {formatTime(seconds)}. Read the whole passage — recordings under
          about {MIN_SECONDS} seconds do not contain enough speech to recognise a voice,
          and will be rejected.
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
