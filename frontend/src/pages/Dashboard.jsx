import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions } from "../api/sessions";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const [sessionsPage, setSessionsPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listSessions();
        if (!cancelled) setSessionsPage(data);
      } catch (err) {
        if (!cancelled) setError("Failed to load sessions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Sessions</h1>
        <Link to="/sessions/new" className="btn-primary">
          + New Session
        </Link>
      </div>

      {loading && <p className="muted">Loading sessions...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && sessionsPage && sessionsPage.content.length === 0 && (
        <div className="card empty-state">
          <p>No sessions yet.</p>
          <Link to="/sessions/new" className="btn-primary">
            Upload your first interview
          </Link>
        </div>
      )}

      {!loading && sessionsPage && sessionsPage.content.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Date</th>
                <th>Status</th>
                <th>Prediction</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessionsPage.content.map((session) => (
                <tr key={session.id}>
                  <td>{session.participantRef}</td>
                  <td>{new Date(session.createdAt).toLocaleString()}</td>
                  <td>
                    <StatusBadge status={session.status} />
                  </td>
                  <td>
                    {session.prediction
                      ? session.prediction === "depressed"
                        ? "Depressed"
                        : "Not depressed"
                      : "—"}
                  </td>
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
      )}
    </div>
  );
}
