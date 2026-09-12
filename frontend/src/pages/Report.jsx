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
import { LoadingState } from "../components/states";
import { plainLabel } from "../lib/featureGlossary";

const MODALITY_NAMES = { text: "What was said", audio: "How it was said", video: "Facial movement" };

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
  // Null on reports created before the scoring details were stored; every use
  // below falls back to what those reports always showed.
  const details = report?.scoringDetails;
  const cutOff = typeof details?.decision_threshold === "number" ? details.decision_threshold : null;
  const warnings = details?.distribution_warnings ?? [];

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

      {loading && <LoadingState variant="panel" rows={3} label="Loading report" />}
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
                threshold={cutOff}
              />
            </div>

            <div className="alert alert-warning report-disclaimer">
              This is an AI screening-support indicator, not a diagnosis. In testing
              it was wrong about 3 times in every 10. The percentage is the
              model&apos;s depression score — not a severity, and not how sure it is.{" "}
              {cutOff !== null
                ? `The model flags a session as depressed when the score reaches ${Math.round(cutOff * 100)}%. That cut-off was set during training and is below 50% because only about 3 in 10 people in the training interviews were depressed.`
                : "The model flags a session as depressed when the score reaches its cut-off, which can be well below 50%."}{" "}
              A qualified clinician should review this alongside their own
              professional judgment.
            </div>
          </div>

          {/* Shown when a recording differs sharply from the training
              interviews. The verdict is unchanged — this says which parts of it
              rest on measurements the models never saw anything like. */}
          {warnings.length > 0 && (
            <div className="alert alert-warning">
              <strong>Read parts of this result with caution.</strong> Some
              measurements from this recording were far outside the range of the
              interviews the models learned from, so the scores that depend on
              them are less reliable:
              <ul className="report-warning-list">
                {warnings.map((w) => (
                  <li key={w.modality}>
                    <strong>{MODALITY_NAMES[w.modality] ?? w.modality}</strong>: {w.far} of the{" "}
                    {w.total} measurements it relies on, most of all &ldquo;
                    {plainLabel(w.worst_feature)}&rdquo;.
                  </li>
                ))}
              </ul>
              Differences in microphone, camera, lighting or interview length can
              cause this, as well as the person themselves.
            </div>
          )}

          <div className="card">
            <h2>Modality contributions</h2>
            <p className="muted">
              How strongly each modality (audio, text, video) contributed to the
              fused prediction
              {details ? ", and what each one concluded on its own." : "."}
            </p>
            <ModalityContributions
              modalityContributions={report.modalityContributions}
              details={details}
            />
          </div>

          <div className="card">
            <h2>Explainability breakdown</h2>
            <p className="muted">
              What the model measured in the participant&apos;s speech, strongest first.
              Each one says what was observed and which way it pushed the result.
              Weights compare measurements within each part&apos;s own model; how much
              each part counts in the final result is shown under Modality
              contributions.
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
