/**
 * The model's verdict for a session, as a scannable tag.
 *
 * Deliberately two-valued. The model produces a binary prediction plus a
 * confidence, not a severity grade — there is no "moderate" or "severe" to
 * show, and inventing a scale would imply a clinical judgement the model
 * never made. Confidence is displayed as its own column, never folded into
 * this tag, for the same reason.
 */
export default function ResultTag({ prediction }) {
  if (!prediction) return <span className="muted">—</span>;

  const elevated = prediction === "depressed";
  return (
    <span className={`result-tag ${elevated ? "elevated" : "clear"}`}>
      <span className="result-dot" aria-hidden="true" />
      {elevated ? "Elevated indicators" : "No elevated indicators"}
    </span>
  );
}
