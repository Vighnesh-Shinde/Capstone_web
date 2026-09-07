/**
 * The model's verdict for a session, as a scannable tag.
 *
 * Says "Depressed" / "Not depressed" — the model's own two class names. An
 * earlier version said "Elevated indicators" to avoid sounding diagnostic, but
 * softening the words did not make the result less consequential, it only made
 * it harder to read: the operator could not tell what the tool had actually
 * concluded. The honesty belongs in the disclaimer beside it, which says
 * outright that this is screening support, is wrong about one time in four,
 * and is not a diagnosis.
 *
 * Still deliberately two-valued. The model produces a binary prediction plus a
 * confidence, not a severity grade — there is no "moderate" or "severe" to
 * show, and inventing a scale would imply a clinical judgement it never made.
 * Confidence is displayed as its own column, never folded into this tag.
 */
export default function ResultTag({ prediction }) {
  if (!prediction) return <span className="muted">—</span>;

  const elevated = prediction === "depressed";
  return (
    <span className={`result-tag ${elevated ? "elevated" : "clear"}`}>
      <span className="result-dot" aria-hidden="true" />
      {elevated ? "Depressed" : "Not depressed"}
    </span>
  );
}
