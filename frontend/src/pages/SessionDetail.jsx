import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSession } from "../api/sessions";
import StatusBadge from "../components/StatusBadge";

const POLL_INTERVAL_MS = 3000;

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getSession(id);
        if (cancelled) return;
        setSession(data);

        if (data.status === "COMPLETED") {
          navigate(`/sessions/${id}/report`, { replace: true });
          return;
        }
        if (data.status === "UPLOADED" || data.status === "PROCESSING") {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError("Failed to load session status.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [id, navigate]);

  return (
    <div className="page">
      <Link to="/" className="btn-link">
        ← Back to sessions
      </Link>
      <h1>Session status</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {!session && !error && <p className="muted">Loading...</p>}

      {session && (
        <div className="card status-card">
          <div className="status-card-row">
            <span className="field-label">Participant</span>
            <span>{session.participantRef}</span>
          </div>
          <div className="status-card-row">
            <span className="field-label">Status</span>
            <StatusBadge status={session.status} />
          </div>

          {(session.status === "UPLOADED" || session.status === "PROCESSING") && (
            <div className="processing-indicator">
              <div className="spinner" />
              <p>Analyzing interview audio and transcript. This usually takes a few seconds...</p>
            </div>
          )}

          {session.status === "FAILED" && (
            <div className="alert alert-error">
              Processing failed for this session. Please try uploading again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
