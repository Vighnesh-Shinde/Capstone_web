import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useReturnTo } from "../hooks/useReturnTo";
import { getReport, getSession } from "../api/sessions";
import ExplanationFactorBar from "../components/ExplanationFactorBar";
import ModalityContributions from "../components/ModalityContributions";
import ConfidenceRing from "../components/ConfidenceRing";
import PlainExplanation from "../components/PlainExplanation";
import JudgmentPanel from "../components/JudgmentPanel";
import ConsentRecord from "../components/ConsentRecord";
import SpeakerAttributionPanel from "../components/SpeakerAttributionPanel";
import SessionNotes from "../components/SessionNotes";

export default function Report() {
  const { id } = useParams();
  // Returns to the filtered list the user came from, not a bare list URL.
  const back = useReturnTo("/sessions");
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
      <button type="button" className="btn-link" onClick={back.goBack}>
        ← Back to sessions
      </button>

      <header className="page-header">
        <h1>Report</h1>
        {report && (
          // Browser print dialog rather than a PDF library: "Save as PDF" is
          // built into every browser's print flow, so this needs no dependency
          // and produces a file the counselor can file or hand over.
          <button className="btn-secondary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        )}
      </header>

      {loading && <p className="muted">Loading report...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {report && (
        <>
          <div className="card report-summary">
            <div className="verdict">
              <div className="verdict-text">
                {session && (
                  <span className="verdict-participant">{session.participantRef}</span>
                )}
                <span className={`verdict-headline ${report.prediction}`}>
                  {report.prediction === "depressed" ? "Depressed" : "Not depressed"}
                </span>
                <span className="verdict-sub">
                  {report.prediction === "depressed"
                    ? "Screening result only. Recommend follow-up, weighed against your own assessment."
                    : "Screening result only. The model saw no depression pattern in this session."}
                </span>
                <span className="verdict-meta">
                  Generated {new Date(report.createdAt).toLocaleString()}
                  {session?.languageName && (
                    <> · Interview conducted in {session.languageName}</>
                  )}
                </span>
              </div>
              <ConfidenceRing
                value={report.confidenceScore}
                prediction={report.prediction}
              />
            </div>

            <div className="alert alert-warning report-disclaimer">
              This is an AI screening-support indicator, not a diagnosis. It is
              wrong in roughly 1 of every 4 cases, and it does not measure
              severity — a higher percentage means the model is more confident,
              not that the person is more unwell. A qualified clinician should
              review this alongside their own professional judgment.
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
              What the model measured in the participant&apos;s speech, strongest first.
              Each one says what was observed and which way it pushed the result.
            </p>
            <div className="factor-list">
              {report.explanationFactors.map((factor) => (
                <ExplanationFactorBar key={factor.featureName} factor={factor} maxAbsScore={maxAbsScore} />
              ))}
            </div>
          </div>

          {/* Placed after the technical breakdown and before the counsellor's
              own assessment: it is the same evidence in language a participant
              can follow, and it belongs with the reasoning rather than as an
              afterthought at the end. */}
          <PlainExplanation
            factors={report.explanationFactors}
            prediction={report.prediction}
          />

          <div className="card">
            <h2>Counselor assessment</h2>
            <JudgmentPanel
              sessionId={id}
              aiPrediction={report.prediction}
              judgment={report.judgment}
              onSubmitted={(judgment) => setReport((r) => ({ ...r, judgment }))}
            />
          </div>

          {/* Shown here rather than only on SessionDetail: a completed session
              redirects straight to this page, so the consent record would
              otherwise be somewhere the counselor never lands. */}
          {/* Above the consent record deliberately: "was this the right
              person's voice?" has to be answerable before anything else on
              the page means much. */}
          <SpeakerAttributionPanel session={session} />

          <ConsentRecord session={session} />

          <SessionNotes sessionId={id} initialNotes={session?.notes} />
        </>
      )}
    </div>
  );
}
