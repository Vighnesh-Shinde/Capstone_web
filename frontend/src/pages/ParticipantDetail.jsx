import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReturnTo } from "../hooks/useReturnTo";
import { getParticipant } from "../api/participants";
import ParticipantTrendChart from "../components/ParticipantTrendChart";
import StatusBadge from "../components/StatusBadge";
import { LoadingState } from "../components/states";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function predictionLabel(prediction) {
  if (!prediction) return "—";
  return prediction === "depressed" ? "Depressed" : "Not depressed";
}

export default function ParticipantDetail() {
  const { id } = useParams();
  // Returns to the filtered list the user came from, not a bare list URL.
  const back = useReturnTo("/participants");
  const [participant, setParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getParticipant(id)
      .then((data) => !cancelled && setParticipant(data))
      .catch((err) =>
        !cancelled &&
        setError(
          err.response?.status === 403
            ? "You don't have access to this participant."
            : "Failed to load this participant."
        )
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="page"><LoadingState variant="panel" rows={3} label="Loading history" /></div>;
  }

  if (error) {
    return (
      <div className="page">
        <button type="button" className="btn-link" onClick={back.goBack}>
        ← Back to participants</button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  const judged = participant.sessions.filter((s) => s.counselorAssessment);
  const disagreements = judged.filter((s) => s.agreement === "DISAGREE").length;

  return (
    <div className="page">
      <button type="button" className="btn-link" onClick={back.goBack}>
        ← Back to participants</button>

      <header className="page-header">
        <div>
          <h1>{participant.participantRef}</h1>
          <p className="muted">
            {participant.sessionCount} session{participant.sessionCount === 1 ? "" : "s"} ·
            first seen {new Date(participant.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Link to="/sessions/new" className="btn-primary">
          + New session
        </Link>
      </header>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{participant.sessionCount}</span>
          <span className="stat-label">Total sessions</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{judged.length}</span>
          <span className="stat-label">You assessed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{disagreements}</span>
          <span className="stat-label">Differed from model</span>
        </div>
      </div>

      <ParticipantTrendChart sessions={participant.sessions} />

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Model</th>
              <th>Confidence</th>
              <th>Your assessment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* Newest first here, the opposite of the chart: a table is read
                top-down for "what happened most recently", a trend line is read
                left-to-right through time. */}
            {[...participant.sessions].reverse().map((s) => (
              <tr key={s.sessionId}>
                <td>{formatDateTime(s.createdAt)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{predictionLabel(s.prediction)}</td>
                <td>
                  {typeof s.confidenceScore === "number"
                    ? `${(s.confidenceScore * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td>
                  {s.counselorAssessment ? (
                    <>
                      {predictionLabel(s.counselorAssessment)}
                      {s.agreement === "DISAGREE" && (
                        <span className="tag-warning">differs</span>
                      )}
                    </>
                  ) : (
                    <span className="muted">Not recorded</span>
                  )}
                </td>
                <td>
                  <Link to={`/sessions/${s.sessionId}`} className="btn-link">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
