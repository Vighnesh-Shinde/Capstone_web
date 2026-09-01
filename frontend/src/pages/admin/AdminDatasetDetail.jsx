import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { approveDatasetSample, getDatasetSample, rejectDatasetSample } from "../../api/admin";
import StatusBadge from "../../components/StatusBadge";
import ExplanationFactorBar from "../../components/ExplanationFactorBar";

export default function AdminDatasetDetail() {
  const { id } = useParams();
  const [sample, setSample] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    getDatasetSample(id)
      .then(setSample)
      .catch(() => setError("Failed to load sample."));
  }

  useEffect(load, [id]);

  async function runAction(action) {
    setBusy(true);
    setActionError("");
    try {
      const updated = await action();
      setSample(updated);
    } catch (err) {
      setActionError(err.response?.data?.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!sample) return <div className="page"><p className="muted">Loading...</p></div>;

  const maxAbsScore = sample.explanationFactors.reduce((max, f) => Math.max(max, Math.abs(f.contributionScore)), 0);
  const reviewable = sample.eligibilityStatus !== "EXCLUDED_NO_CONSENT";

  return (
    <div className="page">
      <Link to="/admin/dataset" className="btn-link">
        ← Back to dataset
      </Link>
      <div className="page-header">
        <h1>Sample: {sample.participantRef}</h1>
        <StatusBadge status={sample.eligibilityStatus} />
      </div>

      <div className="card">
        <h2>Session</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field-label">Counselor</span>
            <span>{sample.counselorName} ({sample.counselorEmail})</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Session date</span>
            <span>{new Date(sample.sessionCreatedAt).toLocaleString()}</span>
          </div>
        </div>

        <span className="field-label">Consent</span>
        <p className="muted">
          Recording: {sample.consentRecording ? "Yes" : "No"} · AI analysis: {sample.consentAiAnalysis ? "Yes" : "No"} ·
          Storage: {sample.consentStorage ? "Yes" : "No"} · Research reuse: {sample.consentResearchReuse ? "Yes" : "No"}
        </p>
      </div>

      <div className="card">
        <h2>AI Prediction</h2>
        <p><strong>{sample.aiPrediction ?? "—"}</strong> ({sample.aiConfidence != null ? `${Math.round(sample.aiConfidence * 100)}%` : "—"} confidence)</p>

        {sample.modalityContributions && (
          <div className="modality-list">
            {["audio", "text", "video"].map((m) => {
              const v = sample.modalityContributions[m];
              if (v == null) return null;
              return (
                <div className="modality-row" key={m}>
                  <div className="factor-header">
                    <span className="factor-name">{m}</span>
                    <span className="factor-score positive">{Math.round(v * 100)}%</span>
                  </div>
                  <div className="factor-bar-track">
                    <div className="factor-bar-fill positive" style={{ width: `${Math.round(v * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="factor-list">
          {sample.explanationFactors.map((factor) => (
            <ExplanationFactorBar key={factor.featureName} factor={factor} maxAbsScore={maxAbsScore} />
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Counselor Judgment</h2>
        {sample.judgment ? (
          <>
            <p><strong>{sample.judgment.assessment}</strong> — <span className={`agreement-badge ${sample.judgment.agreement === "AGREE" ? "agree" : "disagree"}`}>{sample.judgment.agreement}</span></p>
            {sample.judgment.observation && <p className="muted">{sample.judgment.observation}</p>}
          </>
        ) : (
          <p className="muted">No counselor judgment submitted yet.</p>
        )}
      </div>

      <div className="card">
        <h2>Dataset Decision</h2>
        {actionError && <div className="alert alert-error">{actionError}</div>}

        {sample.adminNotes && (
          <>
            <span className="field-label">Previous admin notes</span>
            <p>{sample.adminNotes}</p>
          </>
        )}

        {reviewable && sample.eligibilityStatus !== "APPROVED" && sample.eligibilityStatus !== "REJECTED" && (
          <>
            <label className="field-label" htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="action-row">
              <button className="btn-primary" disabled={busy} onClick={() => runAction(() => approveDatasetSample(id, notes))}>
                Approve for dataset
              </button>
              <button className="btn-danger" disabled={busy} onClick={() => runAction(() => rejectDatasetSample(id, notes))}>
                Reject
              </button>
            </div>
          </>
        )}

        {!reviewable && (
          <p className="muted">
            This sample is excluded because the participant did not consent to
            research reuse. It cannot be reviewed for dataset inclusion.
          </p>
        )}

        {(sample.eligibilityStatus === "APPROVED" || sample.eligibilityStatus === "REJECTED") && (
          <p className="muted">
            Reviewed{sample.adminReviewedByName ? ` by ${sample.adminReviewedByName}` : ""}
            {sample.adminReviewedAt ? ` on ${new Date(sample.adminReviewedAt).toLocaleString()}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
