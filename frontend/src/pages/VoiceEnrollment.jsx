import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enrollVoice, getEnrollmentPassage, getVoiceprintStatus } from "../api/voiceprint";
import VoiceRecorder from "../components/VoiceRecorder";

/**
 * The counselor records their own voice so sessions can tell it apart from the
 * participant's.
 *
 * The page leads with why, because "read this passage into your microphone" is
 * an odd request from clinical software and the reason is genuinely
 * reassuring: the recording is used to *exclude* the counselor's speech, is
 * never analysed, and does not survive the minute it takes to process.
 */
export default function VoiceEnrollment() {
  const navigate = useNavigate();

  const [passage, setPassage] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioFile, setAudioFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEnrollmentPassage(), getVoiceprintStatus()])
      .then(([p, s]) => {
        if (cancelled) return;
        setPassage(p);
        setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this page. Please reload and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (!audioFile) return;
    setError("");
    setSubmitting(true);
    try {
      const updated = await enrollVoice(audioFile);
      setStatus(updated);
      setDone(true);
    } catch (err) {
      // The server's wording is passed through: "two voices were detected" is
      // something the counselor can act on, "enrollment failed" is not.
      setError(err.response?.data?.message || "Your recording could not be processed.");
      setAudioFile(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="page"><p className="muted">Loading…</p></div>;
  }

  if (done) {
    return (
      <div className="page prose-page">
        <div className="card">
          <h1>Voice recorded</h1>
          <p>
            Your voice is on file until{" "}
            <strong>{new Date(status.expiresAt).toLocaleDateString()}</strong>. Sessions
            you upload will now separate your speech from the participant&apos;s
            automatically.
          </p>
          <p className="muted">
            The recording itself has already been deleted — only the numeric voice
            profile was kept.
          </p>
          <div className="action-row">
            <button className="btn-primary" onClick={() => navigate("/sessions/new")}>
              Start a session
            </button>
            <button className="btn-secondary" onClick={() => navigate("/")}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const expired = status?.enrolled && !status?.valid;

  return (
    <div className="page prose-page">
      <h1>{status?.enrolled ? "Update your voice recording" : "Record your voice"}</h1>

      {expired && (
        <div className="alert alert-warning">
          Your previous recording expired on{" "}
          {new Date(status.expiresAt).toLocaleDateString()}. You cannot start a new
          session until you record again.
        </div>
      )}

      <div className="card">
        <h2>Why this is needed</h2>
        <p>
          A session recording contains your voice and the participant&apos;s. The
          analysis is trained on the participant only, so it has to know which voice
          is yours — otherwise it may read your speech and report it as theirs.
        </p>
        <p>
          It used to guess, by assuming the participant is whoever talks more. That
          assumption breaks in exactly the sessions that matter most: when someone is
          very withdrawn and answers in single words, you are the one talking more.
        </p>

        <h3>What happens to this recording</h3>
        <ul>
          <li>
            It is converted into a set of numbers that describe your voice, and the
            audio file is <strong>deleted immediately afterwards</strong>. It is never
            stored and never played back.
          </li>
          <li>
            The numbers are used only to <strong>exclude</strong> your speech from
            analysis. Your voice is never scored, and nothing about you is assessed.
          </li>
          <li>
            You will be asked to do this again in about a month. Voices and microphones
            drift, and an old reference matches less well.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Read this aloud</h2>
        <p className="muted">
          About {passage?.approxSeconds} seconds at a normal pace. Somewhere quiet, with
          nobody else speaking — a second voice in the recording will be rejected.
          It does not matter if you stumble; read on.
        </p>

        <blockquote className="enrollment-passage">{passage?.text}</blockquote>

        <VoiceRecorder onRecorded={(file) => setAudioFile(file)} disabled={submitting} />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="action-row">
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!audioFile || submitting}
          >
            {submitting ? "Processing…" : "Submit recording"}
          </button>
        </div>
      </div>
    </div>
  );
}
