/**
 * The headline depression score, drawn as a progress ring.
 *
 * Hand-built SVG rather than a chart library — it is one arc, and inlining it
 * lets the stroke inherit the semantic colour that already encodes the
 * prediction, so the ring and the banner never disagree.
 *
 * The number is the model's depression score, NOT a severity and NOT how sure
 * it is. It was labelled "confidence" until a real report read "Depressed,
 * 35% confidence": correct — the DAIC-WOZ model flags at about 29%, because
 * only ~30% of its training interviews were depressed — but a reader takes
 * 35% confidence to mean "probably not". So the ring now says what the number
 * is, and marks the cut-off on the arc when the report knows it.
 */
const SIZE = 132;
const STROKE = 11;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ConfidenceRing({ value, prediction, threshold }) {
  if (typeof value !== "number") return null;

  const pct = Math.max(0, Math.min(1, value));
  const shown = Math.round(pct * 100);
  const tone = prediction === "depressed" ? "elevated" : "clear";
  const hasCut = typeof threshold === "number";

  // The cut-off as a short tick across the track. The group below is rotated
  // so 0 is at 12 o'clock; within it, angle 0 points along +x.
  const cutAngle = hasCut ? 2 * Math.PI * Math.max(0, Math.min(1, threshold)) : 0;
  const c = SIZE / 2;
  const tick = (r) => [c + r * Math.cos(cutAngle), c + r * Math.sin(cutAngle)];
  const [x1, y1] = tick(RADIUS - STROKE);
  const [x2, y2] = tick(RADIUS + STROKE / 2);

  return (
    <div className={`confidence-ring ${tone}`}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          `Depression score ${shown} percent` +
          (hasCut ? `, cut-off ${Math.round(threshold * 100)} percent` : "")
        }
      >
        {/* Rotated so the arc starts at 12 o'clock rather than 3 o'clock. */}
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle
            className="ring-track"
            cx={c}
            cy={c}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            className="ring-arc"
            cx={c}
            cy={c}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - pct)}
          />
          {hasCut && <line className="ring-threshold" x1={x1} y1={y1} x2={x2} y2={y2} />}
        </g>
      </svg>
      <div className="ring-centre">
        <span className="ring-value">{shown}%</span>
        {/* Two lines: the inside of the ring is ~110px, narrower than the
            caption on one line. */}
        <span className="ring-caption">depression<br />score</span>
        {hasCut && <span className="ring-cutoff">cut-off {Math.round(threshold * 100)}%</span>}
      </div>
    </div>
  );
}
