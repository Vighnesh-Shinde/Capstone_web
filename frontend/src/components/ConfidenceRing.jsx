/**
 * The headline confidence figure, drawn as a progress ring.
 *
 * Hand-built SVG rather than a chart library — it is one arc, and inlining it
 * lets the stroke inherit the semantic colour that already encodes the
 * prediction, so the ring and the banner never disagree.
 *
 * The ring shows the model's confidence, NOT a severity level. Those are
 * different things and conflating them is the most likely way a reader
 * misreads this screen: 80% does not mean "more depressed" than 60%, it means
 * the model is more sure that indicators are present.
 */
const SIZE = 132;
const STROKE = 11;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ConfidenceRing({ value, prediction }) {
  if (typeof value !== "number") return null;

  const pct = Math.max(0, Math.min(1, value));
  const shown = Math.round(pct * 100);
  const tone = prediction === "depressed" ? "elevated" : "clear";

  return (
    <div className={`confidence-ring ${tone}`}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Model confidence ${shown} percent`}
      >
        {/* Rotated so the arc starts at 12 o'clock rather than 3 o'clock. */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            className="ring-track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            className="ring-arc"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - pct)}
          />
        </g>
      </svg>
      <div className="ring-centre">
        <span className="ring-value">{shown}%</span>
        <span className="ring-caption">confidence</span>
      </div>
    </div>
  );
}
