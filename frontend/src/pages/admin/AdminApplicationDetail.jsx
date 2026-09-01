import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  approveApplication,
  downloadDocument,
  getApplication,
  reactivateApplication,
  rejectApplication,
  suspendApplication,
} from "../../api/admin";
import StatusBadge from "../../components/StatusBadge";

export default function AdminApplicationDetail() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  function load() {
    getApplication(id)
      .then(setApplication)
      .catch(() => setError("Failed to load application."));
  }

  useEffect(load, [id]);

  async function runAction(action) {
    setBusy(true);
    setActionError("");
    try {
      const updated = await action();
      setApplication(updated);
      setShowRejectForm(false);
    } catch (err) {
      setActionError(err.response?.data?.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!application) return <div className="page"><p className="muted">Loading...</p></div>;

  return (
    <div className="page">
      <Link to="/admin/applications" className="btn-link">
        ← Back to access requests
      </Link>
      <div className="page-header">
        <h1>{application.fullName}</h1>
        <StatusBadge status={application.status} />
      </div>

      <div className="card">
        <h2>Professional information</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field-label">Email</span>
            <span>{application.email}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Phone</span>
            <span>{application.phone || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Organization</span>
            <span>{application.organization || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Professional role</span>
            <span>{application.professionalRole || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Qualification</span>
            <span>{application.qualification || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Registration number</span>
            <span>{application.registrationNumber || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Submitted</span>
            <span>{new Date(application.submittedAt).toLocaleString()}</span>
          </div>
          {application.reviewedAt && (
            <div className="detail-item">
              <span className="field-label">Reviewed</span>
              <span>
                {new Date(application.reviewedAt).toLocaleString()}
                {application.reviewedByName ? ` by ${application.reviewedByName}` : ""}
              </span>
            </div>
          )}
        </div>

        {application.experience && (
          <>
            <span className="field-label">Experience</span>
            <p>{application.experience}</p>
          </>
        )}
        {application.additionalInfo && (
          <>
            <span className="field-label">Additional information</span>
            <p>{application.additionalInfo}</p>
          </>
        )}
        {application.status === "REJECTED" && application.rejectionReason && (
          <div className="alert alert-error">Rejection reason: {application.rejectionReason}</div>
        )}
      </div>

      <div className="card">
        <h2>Verification documents</h2>
        {application.documents.length === 0 && <p className="muted">No documents uploaded.</p>}
        <div className="document-list">
          {application.documents.map((doc) => (
            <button
              key={doc.id}
              className="btn-link"
              onClick={() => downloadDocument(application.id, doc.id, doc.fileName)}
            >
              {doc.fileName}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Decision</h2>
        {actionError && <div className="alert alert-error">{actionError}</div>}

        {application.status === "PENDING" && !showRejectForm && (
          <div className="action-row">
            <button className="btn-primary" disabled={busy} onClick={() => runAction(() => approveApplication(id))}>
              Approve
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => setShowRejectForm(true)}>
              Reject
            </button>
          </div>
        )}

        {application.status === "PENDING" && showRejectForm && (
          <>
            <label className="field-label" htmlFor="rejectReason">Reason (optional)</label>
            <textarea id="rejectReason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="action-row">
              <button className="btn-danger" disabled={busy} onClick={() => runAction(() => rejectApplication(id, rejectReason))}>
                Confirm reject
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => setShowRejectForm(false)}>
                Cancel
              </button>
            </div>
          </>
        )}

        {application.status === "APPROVED" && (
          <div className="action-row">
            <button className="btn-danger" disabled={busy} onClick={() => runAction(() => suspendApplication(id))}>
              Suspend counselor
            </button>
          </div>
        )}

        {application.status === "SUSPENDED" && (
          <div className="action-row">
            <button className="btn-primary" disabled={busy} onClick={() => runAction(() => reactivateApplication(id))}>
              Reactivate counselor
            </button>
          </div>
        )}

        {application.status === "REJECTED" && <p className="muted">This application was rejected.</p>}
      </div>
    </div>
  );
}
