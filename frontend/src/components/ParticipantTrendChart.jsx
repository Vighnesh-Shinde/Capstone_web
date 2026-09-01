/**
 * AI confidence across a participant's sessions, with the counselor's own
 * recorded assessment overlaid.
 *
 * Hand-drawn SVG rather than a charting library: the project has no chart
 * dependency, and this needs exactly one thing — a small line with markers
 * that reads correctly in the existing palette.
 *
 * The counselor's judgment is drawn as the marker's fill, not as a second
 * line, so the eye reads the AI trajectory first and can see at a glance
 * where the clinician disagreed with it.
 */
const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 20, right: 20, bottom: 42, left: 46 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

function formatShortDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ParticipantTrendChart({ sessions, threshold = 0.48 }) {
  const points = sessions.filter((s) => typeof s.confidenceScore === "number");

  if (points.length < 2) {
    return (
      <div className="card">
        <h2>Trend across sessions</h2>
        <p className="muted">
          {points.length === 0
            ? "No completed analyses yet. The trend appears once sessions have been processed."
            : "One completed session so far. A second creates a trend to compare against."}
        </p>
      </div>
    );
  }

  const x = (i) => PAD.left + (i / (points.length - 1)) * PLOT_W;
  const y = (score) => PAD.top + (1 - score) * PLOT_H;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.confidenceScore)}`).join(" ");
  const thresholdY = y(threshold);

  return (
    <div className="card">
      <h2>Trend across sessions</h2>
      <p className="muted small">
        The model&apos;s confidence that indicators of depression are present, per session.
        Filled markers are sessions where you recorded an assessment.
      </p>

      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="trend-chart"
          role="img"
          aria-label={`Confidence trend across ${points.length} sessions, from ${
            (points[0].confidenceScore * 100).toFixed(0)
          } percent to ${(points[points.length - 1].confidenceScore * 100).toFixed(0)} percent.`}
        >
          {/* horizontal gridlines at 0 / 25 / 50 / 75 / 100% */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={y(tick)}
                y2={y(tick)}
                className="chart-grid"
              />
              <text x={PAD.left - 8} y={y(tick) + 4} className="chart-axis-label" textAnchor="end">
                {tick * 100}%
              </text>
            </g>
          ))}

          {/* the model's decision threshold — above it, the model flags the session */}
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={thresholdY}
            y2={thresholdY}
            className="chart-threshold"
          />
          <text x={PAD.left + PLOT_W} y={thresholdY - 6} className="chart-axis-label" textAnchor="end">
            decision threshold
          </text>

          <path d={linePath} className="chart-line" />

          {points.map((p, i) => {
            const disagreed = p.agreement === "DISAGREE";
            return (
              <g key={p.sessionId}>
                <circle
                  cx={x(i)}
                  cy={y(p.confidenceScore)}
                  r={disagreed ? 7 : 5}
                  className={
                    p.counselorAssessment
                      ? disagreed
                        ? "chart-point judged disagree"
                        : "chart-point judged"
                      : "chart-point"
                  }
                />
                <title>
                  {`${formatShortDate(p.createdAt)} — model ${(p.confidenceScore * 100).toFixed(0)}%` +
                    (p.counselorAssessment
                      ? `, you assessed ${p.counselorAssessment === "depressed" ? "depressed" : "not depressed"}${
                          disagreed ? " (differs from model)" : ""
                        }`
                      : ", no assessment recorded")}
                </title>
              </g>
            );
          })}

          {/* Only label the ends — intermediate labels collide once there are
              more than a handful of sessions. */}
          <text x={x(0)} y={HEIGHT - 14} className="chart-axis-label" textAnchor="start">
            {formatShortDate(points[0].createdAt)}
          </text>
          <text
            x={x(points.length - 1)}
            y={HEIGHT - 14}
            className="chart-axis-label"
            textAnchor="end"
          >
            {formatShortDate(points[points.length - 1].createdAt)}
          </text>
        </svg>
      </div>

      <ul className="chart-legend">
        <li><span className="legend-dot" /> Model confidence</li>
        <li><span className="legend-dot judged" /> You recorded an assessment</li>
        <li><span className="legend-dot disagree" /> Your assessment differed from the model</li>
      </ul>
    </div>
  );
}
