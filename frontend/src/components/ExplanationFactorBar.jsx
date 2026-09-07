import { plainDescription, plainLabel } from "../lib/featureGlossary";

/**
 * One reason behind the result.
 *
 * Leads with plain language and demotes the model's own column name to a
 * small technical footnote. The name is kept rather than dropped — it is what
 * makes a result checkable against the training data, and researchers need it
 * — but "spec rms db p10" as the headline made the single most important part
 * of the report unreadable.
 *
 * The direction is spelled out in words too. A signed number is only
 * meaningful once you know that positive means "toward depressed", and the
 * legend explaining that sat several paragraphs above the numbers.
 */
export default function ExplanationFactorBar({ factor, maxAbsScore }) {
  const magnitude = Math.abs(factor.contributionScore);
  const widthPct = maxAbsScore > 0 ? Math.round((magnitude / maxAbsScore) * 100) : 0;
  const towardDepressed = factor.contributionScore >= 0;

  return (
    <div className="factor-row">
      <div className="factor-header">
        <span className="factor-name">{plainLabel(factor.featureName)}</span>
        <span className={`factor-direction ${towardDepressed ? "positive" : "negative"}`}>
          {towardDepressed ? "toward depressed" : "away from depressed"}
        </span>
      </div>

      <div className="factor-bar-track">
        <div
          className={`factor-bar-fill ${towardDepressed ? "positive" : "negative"}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>

      <p className="factor-description">
        {plainDescription(factor.featureName, factor.contributionScore, factor.description)}
      </p>

      {/* The model's own name for this input, and how hard it pushed. Kept for
          anyone checking a result against the training data, sized so it does
          not compete with the sentence above it. */}
      <p className="factor-technical">
        <span className="mono">{String(factor.featureName).replace(/\s+/g, "_")}</span>
        {factor.modality && <span className="role-tag">{factor.modality}</span>}
        <span className="factor-weight">
          weight {factor.contributionScore > 0 ? "+" : ""}
          {factor.contributionScore.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
