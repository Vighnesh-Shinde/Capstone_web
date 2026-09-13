import { useState } from "react";
import { plainLabel } from "../lib/featureGlossary";

/**
 * SHAP values for the serving early-fusion model, drawn as waterfalls.
 *
 * The model is linear once its per-block PCA is mapped back onto the original
 * columns, so every SHAP value here is exact rather than sampled:
 *
 *     shap_i = weight_i × (value_i − training mean_i) / training SD_i
 *
 * in log-odds, and they add up — base value + every SHAP value = this
 * session's score. That is what makes a true waterfall possible: each bar
 * starts where the previous one ended, and the last one lands on the score
 * the model actually returned.
 */
const MODALITY_LABELS = { text: "What was said", audio: "How it was said", video: "Facial movement" };
const TABS = ["text", "audio", "video"];

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

function Waterfall({ rows, marker, markerLabel }) {
  const points = rows.flatMap((r) => [r.from, r.to]);
  if (typeof marker === "number") points.push(marker);
  const spread = Math.max(...points) - Math.min(...points);
  const pad = spread * 0.06 || 0.5;
  const lo = Math.min(...points) - pad;
  const hi = Math.max(...points) + pad;
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div className="shap-waterfall">
      {rows.map((row) => {
        const kind = row.total ? "total" : row.to >= row.from ? "up" : "down";
        const left = pos(Math.min(row.from, row.to));
        // A floor on the width, so a tiny push is still a visible mark.
        const width = Math.max(Math.abs(pos(row.to) - pos(row.from)), 0.6);
        return (
          <div className={`shap-row shap-${kind}`} key={row.key} title={row.technical}>
            <div className="shap-label">
              <span className="shap-name">{row.label}</span>
              {row.hint && <span className="shap-hint">{row.hint}</span>}
            </div>
            <div className="shap-track">
              {typeof marker === "number" && (
                <span className="shap-marker" style={{ left: `${pos(marker)}%` }} />
              )}
              <span className="shap-bar" style={{ left: `${left}%`, width: `${width}%` }} />
            </div>
            <span className="shap-value">{row.total ? row.to.toFixed(2) : signed(row.to - row.from)}</span>
          </div>
        );
      })}
      {typeof marker === "number" && (
        <p className="shap-axis-note muted small">
          <span className="shap-marker-key" /> {markerLabel}
        </p>
      )}
    </div>
  );
}

function featureHint(feature) {
  if (typeof feature.z !== "number") return feature.hint ?? null;
  const size = Math.abs(feature.z).toFixed(1);
  return `${size} SD ${feature.z >= 0 ? "above" : "below"} the training average`;
}

function modalityRows(modality, block) {
  let at = 0;
  const rows = block.features.map((feature, i) => {
    const from = at;
    at += feature.contribution;
    return {
      key: `${feature.name}-${i}`,
      label: plainLabel(feature.name.replace(/_/g, " ")),
      technical: feature.name,
      hint: featureHint(feature),
      from,
      to: at,
    };
  });
  if (block.other_count > 0) {
    rows.push({
      key: "other",
      label: `${block.other_count.toLocaleString()} other measurements`,
      hint: "each smaller than the ones above, added together",
      from: at,
      to: at + block.other,
    });
  }
  rows.push({
    key: "total",
    label: `Total for ${MODALITY_LABELS[modality].toLowerCase()}`,
    hint: `${modality} SHAP values summed`,
    from: 0,
    to: block.total,
    total: true,
  });
  return rows;
}

export default function ShapExplanation({ shap }) {
  const available = TABS.filter((m) => shap?.modalities?.[m]);
  const [tab, setTab] = useState(available[0] ?? "text");
  if (!shap || available.length === 0) return null;

  const { base_value: base, output_value: output, threshold_value: threshold } = shap;
  let at = base;
  const overall = [
    {
      key: "base",
      label: "Average participant",
      hint: "base value: where every session starts",
      from: 0,
      to: base,
      total: true,
    },
    ...available.map((m) => {
      const from = at;
      at += shap.modalities[m].total;
      return { key: m, label: MODALITY_LABELS[m], hint: `SHAP of all ${m} measurements`, from, to: at };
    }),
    {
      key: "session",
      label: "This session",
      hint: `score ${output.toFixed(2)}, a ${Math.round(sigmoid(output) * 100)}% probability`,
      from: 0,
      to: output,
      total: true,
    },
  ];
  const block = shap.modalities[tab] ?? shap.modalities[available[0]];
  const shownTab = shap.modalities[tab] ? tab : available[0];

  return (
    <div className="card">
      <h2>How the score was built (SHAP)</h2>
      <p className="muted">
        SHAP values split the model&apos;s score into exactly what each measurement added
        (orange bars, toward depressed) or took away (green bars). They are computed from
        the model itself, not estimated, so the bars add up to the score it returned.
        Values are in log-odds, where 0 is a 50% probability.
      </p>

      <Waterfall
        rows={overall}
        marker={threshold}
        markerLabel={`cut-off (${Math.round(sigmoid(threshold) * 100)}% probability): a score to the right of this line is reported as depressed`}
      />

      <div className="shap-tabs" role="tablist" aria-label="SHAP values by modality">
        {available.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            className="shap-tab"
            aria-selected={m === shownTab}
            onClick={() => setTab(m)}
          >
            {MODALITY_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="muted small">
        {shownTab === "text" &&
          "Word habits one by one; the 3,072 sentence-meaning columns are summed into one bar, and split by sentence in the next card."}
        {shownTab === "audio" &&
          "Voice and timing measurements from the participant's own speech, strongest first."}
        {shownTab === "video" &&
          "Facial measurements from OpenFace, strongest first. They are drawn on the participant's face under What the face contributed."}
      </p>
      <Waterfall rows={modalityRows(shownTab, block)} />
    </div>
  );
}
