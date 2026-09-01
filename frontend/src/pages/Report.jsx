import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getReport, getSession } from "../api/sessions";
import ExplanationFactorBar from "../components/ExplanationFactorBar";
import ModalityContributions from "../components/ModalityContributions";
import JudgmentPanel from "../components/JudgmentPanel";

export default function Report() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sessionData, reportData] = await Promise.all([getSession(id), getReport(id)]);
        if (cancelled) return;
        setSession(sessionData);
        setReport(reportData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.status === 409
              ? "This session hasn't finished processing yet."
              : "Failed to load report."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const maxAbsScore =
    report?.explanationFactors.reduce((max, f) => Math.max(max, Math.abs(f.contributionScore)), 0) ?? 0;

  return (
    <div className="page">
      <Link to="/" className="btn-link">
        ← Back to sessions
      </Link>
      <h1>Report</h1>

      {loading && <p className="muted">Loading report...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {report && (
        <>
          <div className="card report-summary">
            {session && (
              <div className="status-card-row">
                <span className="field-label">Participant</span>
                <span>{session.participantRef}</span>
              </div>
            )}
            <div className={`prediction-banner ${report.prediction}`}>
              <span className="prediction-label">
                {report.prediction === "depressed" ? "Elevated indicators — recommend follow-up" : "No elevated indicators detected"}
              </span>
              <span className="confidence-value">
                {Math.round(report.confidenceScore * 100)}% confidence
              </span>
            </div>
            <p className="muted small">
              Generated {new Date(report.createdAt).toLocaleString()}
            </p>
            <div className="alert alert-error" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
              This is an AI screening-support indicator, not a diagnosis. It is
              wrong in roughly 1 of every 4 cases. A qualified clinician should
              review this result alongside their own professional judgment
              before any decision is made.
            </div>
          </div>

          <div className="card">
            <h2>Modality contributions</h2>
            <p className="muted">
              How strongly each modality (audio, text, video) contributed to the
              fused prediction.
            </p>
            <ModalityContributions modalityContributions={report.modalityContributions} />
          </div>

          <div className="card">
            <h2>Explainability breakdown</h2>
            <p className="muted">
              Factors are sorted by how strongly they influenced the prediction. Positive values
              push toward "depressed"; negative values push toward "not depressed".
            </p>
            <div className="factor-list">
              {report.explanationFactors.map((factor) => (
                <ExplanationFactorBar key={factor.featureName} factor={factor} maxAbsScore={maxAbsScore} />
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Counselor assessment</h2>
            <JudgmentPanel
              sessionId={id}
              aiPrediction={report.prediction}
              judgment={report.judgment}
              onSubmitted={(judgment) => setReport((r) => ({ ...r, judgment }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
