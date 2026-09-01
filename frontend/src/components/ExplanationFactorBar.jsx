export default function ExplanationFactorBar({ factor, maxAbsScore }) {
  const magnitude = Math.abs(factor.contributionScore);
  const widthPct = maxAbsScore > 0 ? Math.round((magnitude / maxAbsScore) * 100) : 0;
  const isPositive = factor.contributionScore >= 0;

  return (
    <div className="factor-row">
      <div className="factor-header">
        <span className="factor-name">
          {factor.featureName}
          {factor.modality && <span className="role-tag">{factor.modality}</span>}
        </span>
        <span className={`factor-score ${isPositive ? "positive" : "negative"}`}>
          {factor.contributionScore > 0 ? "+" : ""}
          {factor.contributionScore.toFixed(2)}
        </span>
      </div>
      <div className="factor-bar-track">
        <div
          className={`factor-bar-fill ${isPositive ? "positive" : "negative"}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <p className="factor-description">{factor.description}</p>
    </div>
  );
}
