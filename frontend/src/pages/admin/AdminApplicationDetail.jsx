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
import ProfileSummary from "../../components/ProfileSummary";
import useReferenceData from "../../hooks/useReferenceData";
import { getCountries } from "../../api/reference";
import { LoadingState } from "../../components/states";

export default function AdminApplicationDetail() {
  // Only used to render a flag and full country name beside the ISO code.
  const { data: countries } = useReferenceData(getCountries);
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
  if (!application) return <div className="page"><LoadingState variant="panel" rows={3} label="Loading application" /></div>;

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
          {/* Only for applications submitted before phone numbers were split
              into a dial code and a national number. */}
          {application.legacyPhone && (
            <div className="detail-item">
              <span className="field-label">Phone (as submitted)</span>
              <span>{application.legacyPhone}</span>
            </div>
          )}
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

        <ProfileSummary profile={application.profile} countries={countries} />

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
        {application.documents.length === 0 && (
          <div className="alert alert-warning">
            No documents were uploaded. There is nothing here to verify this
            applicant&apos;s claimed qualifications against.
          </div>
        )}
        <div className="document-list">
          {application.documents.map((doc) => (
            <div key={doc.id} className="document-row">
              <div className="document-main">
                <span className="doc-type-tag">{doc.docTypeLabel}</span>
                <button
                  className="btn-link"
                  onClick={() => downloadDocument(application.id, doc.id, doc.fileName)}
                >
                  {doc.fileName}
                </button>
                {doc.expired && (
                  <span className="result-tag elevated">
                    <span className="result-dot" aria-hidden="true" />
                    Expired
                  </span>
                )}
              </div>
              <div className="document-meta muted">
                {[
                  doc.issuingAuthority && `Issued by ${doc.issuingAuthority}`,
                  doc.documentNumber && `No. ${doc.documentNumber}`,
                  doc.expiresOn && `Valid until ${new Date(doc.expiresOn).toLocaleDateString()}`,
                  doc.fileSize && `${Math.round(doc.fileSize / 1024)} KB`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No details recorded for this file."}
              </div>
            </div>
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
