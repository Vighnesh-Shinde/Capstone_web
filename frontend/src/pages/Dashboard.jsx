import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionStats, listSessions } from "../api/sessions";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import ResultTag from "../components/ResultTag";

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSessionStats(), listSessions({ size: 5 })])
      .then(([statsData, sessionsData]) => {
        if (cancelled) return;
        setStats(statsData);
        setRecent(sessionsData.content);
      })
      .catch(() => !cancelled && setError("Failed to load your dashboard."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="page"><p className="muted">Loading…</p></div>;
  }

  if (error) {
    return <div className="page"><div className="alert alert-error">{error}</div></div>;
  }

  const isEmpty = stats.totalSessions === 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Welcome back, {firstName(user?.name)}</h1>
          <p className="muted">Here&apos;s where things stand.</p>
        </div>
        <Link to="/sessions/new" className="btn-primary">
          + New session
        </Link>
      </header>

      {isEmpty ? (
        <div className="card empty-state">
          <h2>Nothing here yet</h2>
          <p className="muted">
            Upload an interview recording and the platform will transcribe it, separate
            your voice from the participant&apos;s, and produce a screening report for you
            to review.
          </p>
          <Link to="/sessions/new" className="btn-primary">
            Record your first session
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-value">{stats.totalSessions}</span>
              <span className="stat-label">Total sessions</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.totalParticipants}</span>
              <span className="stat-label">Participants</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.sessionsThisWeek}</span>
              <span className="stat-label">This week</span>
            </div>
            {/* Surfaced as an action, not a statistic — this is the counselor's queue. */}
            <Link
              to="/sessions?status=COMPLETED"
              className={stats.awaitingJudgment > 0 ? "stat-card actionable" : "stat-card"}
            >
              <span className="stat-value">{stats.awaitingJudgment}</span>
              <span className="stat-label">Awaiting your assessment</span>
            </Link>
          </div>

          {stats.processing > 0 && (
            <div className="alert alert-info">
              {stats.processing} session{stats.processing === 1 ? " is" : "s are"} still
              processing. Analysis runs on CPU and can take several minutes per recording.
            </div>
          )}

          {stats.failed > 0 && (
            <div className="alert alert-error">
              {stats.failed} session{stats.failed === 1 ? "" : "s"} failed to process.{" "}
              <Link to="/sessions?status=FAILED">Review them</Link>.
            </div>
          )}

          <div className="card table-card">
            <div className="card-header">
              <h2>Recent sessions</h2>
              <Link to="/sessions" className="btn-link">View all</Link>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((session) => (
                  <tr key={session.id}>
                    <td className="cell-strong">{session.participantRef}</td>
                    <td>{new Date(session.createdAt).toLocaleDateString()}</td>
                    <td><StatusBadge status={session.status} /></td>
                    <td><ResultTag prediction={session.prediction} /></td>
                    <td>
                      <Link to={`/sessions/${session.id}`} className="btn-link">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
