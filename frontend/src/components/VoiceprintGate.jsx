import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getVoiceprintStatus } from "../api/voiceprint";

/**
 * Blocks the session form until the counselor's own voice is on file.
 *
 * The server enforces this too — this component cannot be the only guard, and
 * is not. It exists so the counselor finds out now, at their desk, rather than
 * after the interview, when the participant has already left and the recording
 * cannot be re-taken.
 *
 * On a failed status check the children are rendered anyway. A flaky network
 * should not stop someone from working: the server will refuse the upload with
 * the same message if the voiceprint really is missing, so the cost of being
 * wrong here is a clear error a minute later, while the cost of blocking
 * wrongly is a session that never happens.
 */
export default function VoiceprintGate({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getVoiceprintStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="muted">Checking your voice recording…</p>;
  }

  if (status && !status.valid) {
    const lapsed = status.enrolled;
    return (
      <div className="card">
        <h2>{lapsed ? "Your voice recording has expired" : "Record your voice first"}</h2>
        <p>
          A session recording contains your voice and the participant&apos;s, and the
          analysis is trained on the participant only. It needs a recording of your
          voice so it can leave your speech out — otherwise it may read what you said
          and report it as theirs.
        </p>
        {lapsed && (
          <p className="muted">
            Your previous recording expired on{" "}
            {new Date(status.expiresAt).toLocaleDateString()}. Re-recording takes about a
            minute.
          </p>
        )}
        <Link className="btn-primary" to="/voice-enrollment">
          {lapsed ? "Record again" : "Record my voice"}
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Warned a week ahead rather than at the moment it stops working, so
          re-recording is something to fit in between appointments instead of
          an obstacle discovered with a participant already waiting. */}
      {status?.valid && status.daysRemaining !== null && status.daysRemaining <= 7 && (
        <div className="alert alert-warning">
          Your voice recording expires in{" "}
          {status.daysRemaining <= 0 ? "less than a day" : `${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"}`}.{" "}
          <Link to="/voice-enrollment">Record it again</Link> to avoid being interrupted
          mid-clinic.
        </div>
      )}
      {children}
    </>
  );
}
