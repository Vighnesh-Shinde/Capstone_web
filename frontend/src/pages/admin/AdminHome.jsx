import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats } from "../../api/admin";

export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((data) => !cancelled && setStats(data))
      .catch(() => !cancelled && setError("Failed to load stats."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <h1>Admin Overview</h1>
      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.pendingApplications}</div>
            <div className="stat-label">Pending access requests</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.approvedCounselors}</div>
            <div className="stat-label">Approved counselors</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalSessions}</div>
            <div className="stat-label">Total sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.datasetUnderReview}</div>
            <div className="stat-label">Dataset samples awaiting review</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.datasetApproved}</div>
            <div className="stat-label">Dataset samples approved</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.datasetAwaitingJudgment}</div>
            <div className="stat-label">Awaiting counselor judgment</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Manage the platform</h2>
        <p className="muted">
          Review counselor access requests and control which completed sessions
          become part of the controlled research dataset.
        </p>
        <div className="action-row">
          <Link to="/admin/applications" className="btn-primary">
            Access Requests
          </Link>
          <Link to="/admin/dataset" className="btn-secondary">
            Dataset
          </Link>
        </div>
      </div>
    </div>
  );
}
