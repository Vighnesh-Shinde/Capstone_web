import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useReturnTo } from "../hooks/useReturnTo";
import { getSession } from "../api/sessions";
import ConsentRecord from "../components/ConsentRecord";
import SessionNotes from "../components/SessionNotes";
import StatusBadge from "../components/StatusBadge";
import { LoadingState } from "../components/states";

const POLL_INTERVAL_MS = 3000;

// Analysis takes minutes, not tens of minutes. Past this the job has almost
// certainly died — the ML service was restarted mid-run, or the process was
// killed — and the status will never advance on its own. Saying so beats
// spinning forever next to an ever-growing timer.
const STALE_AFTER_MS = 30 * 60 * 1000;

function elapsedMs(since) {
  return Date.now() - new Date(since).getTime();
}

function elapsedLabel(since) {
  const seconds = Math.floor(elapsedMs(since) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function SessionDetail() {
  const { id } = useParams();
  // Returns to the filtered list the user came from, not a bare list URL.
  const back = useReturnTo("/sessions");
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getSession(id);
        if (cancelled) return;
        setSession(data);

        if (data.status === "COMPLETED") {
          // `state` is carried through so the report's back control still
          // knows which filtered list the counsellor started from. Dropping it
          // here would silently undo the fix one page later.
          //
          // replace: true so browser Back skips this page — it exists only to
          // wait for processing, and returning to a "still processing" screen
          // for a session that has finished is confusing.
          navigate(`/sessions/${id}/report`, { replace: true, state: back.state });
          return;
        }
        if (data.status === "UPLOADED" || data.status === "PROCESSING") {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) setError("Failed to load session status.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [id, navigate]);

  // A ticking elapsed time is the difference between "this is working" and
  // "this has hung" — real analysis takes minutes on CPU, and a static
  // spinner gives the counselor no way to tell those apart.
  useEffect(() => {
    if (!session || (session.status !== "UPLOADED" && session.status !== "PROCESSING")) {
      return undefined;
    }
    setElapsed(elapsedLabel(session.createdAt));
    const ticker = setInterval(() => setElapsed(elapsedLabel(session.createdAt)), 1000);
    return () => clearInterval(ticker);
  }, [session]);

  const inProgress =
    session && (session.status === "UPLOADED" || session.status === "PROCESSING");
  const stalled = inProgress && elapsedMs(session.createdAt) > STALE_AFTER_MS;

  return (
    <div className="page">
      <button type="button" className="btn-link" onClick={back.goBack}>
        ← Back to sessions
      </button>
      <h1>Session status</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {!session && !error && <LoadingState variant="panel" rows={2} label="Loading session" />}

      {session && (
        <>
          <div className="card status-card">
            <div className="status-card-row">
              <span className="field-label">Participant</span>
              <span>
                {session.participantId ? (
                  <Link to={`/participants/${session.participantId}`}>
                    {session.participantRef}
                  </Link>
                ) : (
                  session.participantRef
                )}
              </span>
            </div>
            <div className="status-card-row">
              <span className="field-label">Started</span>
              <span>{new Date(session.createdAt).toLocaleString()}</span>
            </div>
            <div className="status-card-row">
              <span className="field-label">Status</span>
              <StatusBadge status={session.status} />
            </div>

            {inProgress && !stalled && (
              <div className="processing-indicator">
                <div className="spinner" />
                <div>
                  <p>
                    Transcribing the recording, separating your voice from the
                    participant&apos;s, and analysing their speech.
                  </p>
                  <p className="muted small">
                    Running {elapsed} · this takes several minutes per recording on CPU.
                    You can leave this page — processing continues, and the session will
                    be waiting in your list.
                  </p>
                </div>
              </div>
            )}

            {stalled && (
              <div className="alert alert-warning">
                This session has been marked as processing for {elapsed} and has almost
                certainly stopped — analysis normally finishes within a few minutes. The
                recording is still stored. Upload it again to retry, or ask an
                administrator to check the analysis service.
              </div>
            )}

            {session.status === "FAILED" && (
              <div className="alert alert-error">
                {/* The server now records a reason for most failures; the
                    generic text is the fallback for older rows that have none. */}
                {session.failureReason ||
                  "Processing failed for this session. The recording may be unreadable, too " +
                    "short, or contain no detectable speech. Try uploading it again, or upload " +
                    "a different recording."}
              </div>
            )}

            {/* A warning, not an error. The recording is usually fine — the
                analysis declined to guess whose voice it was reading, which is
                the correct outcome and something the counselor can resolve. */}
            {/* Amber, not red, and phrased around what to do next: the file
                is fine, the interview was simply shorter than anything the
                models were trained on. */}
            {session.status === "TOO_SHORT" && (
              <div className="alert alert-warning">
                <strong>This interview was too short to score.</strong>
                <p>{session.failureReason}</p>
                <p className="muted">
                  The recording itself is fine and the transcript was produced
                  normally — there is simply not enough of the participant&apos;s
                  speech for the analysis to mean anything. Nothing needs fixing on
                  your side beyond recording a fuller session.
                </p>
              </div>
            )}

            {session.status === "SPEAKER_UNVERIFIED" && (
              <div className="alert alert-warning">
                <strong>This session was transcribed but not scored.</strong>
                <p>{session.failureReason}</p>
                <p className="muted">
                  Nothing is wrong with the recording itself. The analysis only reads the
                  participant&apos;s speech, so it has to be certain which voice is
                  theirs — and it will not guess. Check who was in the room, make sure
                  everyone besides the participant recorded the passage, and upload again.
                </p>
              </div>
            )}
          </div>

          <SessionNotes sessionId={session.id} initialNotes={session.notes} />
          <ConsentRecord session={session} />
        </>
      )}
    </div>
  );
}
