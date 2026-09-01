import { useState } from "react";
import { submitJudgment } from "../api/judgment";

const PREDICTION_LABEL = {
  depressed: "Depressed",
  not_depressed: "Not depressed",
};

export default function JudgmentPanel({ sessionId, aiPrediction, judgment, onSubmitted }) {
  const [assessment, setAssessment] = useState("depressed");
  const [observation, setObservation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await submitJudgment(sessionId, assessment, observation);
      onSubmitted(result);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit judgment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (judgment) {
    return (
      <div className="judgment-compare">
        <div className="judgment-col">
          <span className="field-label">AI Prediction</span>
          <p>
            <strong>{PREDICTION_LABEL[aiPrediction] ?? aiPrediction}</strong>
          </p>
        </div>
        <div className="judgment-col">
          <span className="field-label">Counselor Assessment</span>
          <p>
            <strong>{PREDICTION_LABEL[judgment.assessment] ?? judgment.assessment}</strong>
          </p>
          <span className={`agreement-badge ${judgment.agreement === "AGREE" ? "agree" : "disagree"}`}>
            {judgment.agreement}
          </span>
        </div>
        {judgment.observation && (
          <div className="judgment-col" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Professional Observation</span>
            <p>{judgment.observation}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="muted">
        Record your own professional assessment. This is stored separately from
        the AI prediction and does not modify it.
      </p>

      <label className="field-label" htmlFor="assessment">Your assessment</label>
      <select id="assessment" value={assessment} onChange={(e) => setAssessment(e.target.value)}>
        <option value="depressed">Depressed</option>
        <option value="not_depressed">Not depressed</option>
      </select>

      <label className="field-label" htmlFor="observation">Professional observation</label>
      <textarea
        id="observation"
        placeholder="Optional notes on your assessment..."
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
      />

      {error && <div className="alert alert-error">{error}</div>}

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit assessment"}
      </button>
    </form>
  );
}
