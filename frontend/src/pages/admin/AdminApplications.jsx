import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listApplications } from "../../api/admin";
import StatusBadge from "../../components/StatusBadge";

const STATUS_FILTERS = [
  { label: "All", value: null },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Suspended", value: "SUSPENDED" },
];

export default function AdminApplications() {
  const [status, setStatus] = useState("PENDING");
  const [applicationsPage, setApplicationsPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listApplications(status)
      .then((data) => !cancelled && setApplicationsPage(data))
      .catch(() => !cancelled && setError("Failed to load applications."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="page">
      <h1>Counselor Access Requests</h1>

      <div className="filter-tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            className={status === f.value ? "filter-tab active" : "filter-tab"}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && applicationsPage && applicationsPage.content.length === 0 && (
        <div className="card empty-state">
          <p>No applications found for this filter.</p>
        </div>
      )}

      {!loading && applicationsPage && applicationsPage.content.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Counselor</th>
                <th>Qualification</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applicationsPage.content.map((app) => (
                <tr key={app.id}>
                  <td>
                    {app.fullName}
                    <br />
                    <span className="muted">{app.email}</span>
                  </td>
                  <td>{app.qualification || "—"}</td>
                  <td>{new Date(app.submittedAt).toLocaleDateString()}</td>
                  <td>
                    <StatusBadge status={app.status} />
                  </td>
                  <td>
                    <Link to={`/admin/applications/${app.id}`} className="btn-link">
                      Review
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
