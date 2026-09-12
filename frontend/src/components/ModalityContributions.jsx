const MODALITIES = {
  text: {
    label: "Text",
    blurb: "What was said",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  audio: {
    label: "Audio",
    blurb: "How it was said",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
           strokeLinecap="round" aria-hidden="true">
        <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
      </svg>
    ),
  },
  video: {
    label: "Video",
    blurb: "Facial movement",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="6" width="14" height="12" rx="2.5" />
        <path d="M16 11.5 22 8v8l-6-3.5z" />
      </svg>
    ),
  },
};

/** A probability as a percentage with one decimal: 29.9% and 30.1% must not both read "30%". */
function pct1(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * How much each modality pulled the final score.
 *
 * A modality contributing exactly nothing is shown as deliberately switched
 * off rather than as a 0% bar: a silent 0% would read as "the video analysis
 * found nothing", which is a different and untrue claim.
 *
 * When the report carries its scoring details, each card also says what that
 * modality concluded on its own — its score against its own cut-off. That is
 * what explains a mixed result: in a real report the text model was just
 * below its cut-off, the video model far below, and the verdict "Depressed"
 * came from the audio model alone. The shares cannot show that.
 */
export default function ModalityContributions({ modalityContributions, details }) {
  if (!modalityContributions) return null;

  const entries = ["text", "audio", "video"]
    .map((key) => [key, modalityContributions[key]])
    .filter(([, value]) => value != null);

  if (entries.length === 0) return null;

  return (
    <div className="modality-grid">
      {entries.map(([key, value]) => {
        const pct = Math.round(value * 100);
        const meta = MODALITIES[key] ?? { label: key, blurb: "" };
        const unused = pct === 0;
        const own = details?.modality_probabilities?.[key];
        const cut = details?.modality_thresholds?.[key];
        const weight = details?.fusion_weights?.[key];

        return (
          <div className={unused ? "modality-card unused" : "modality-card"} key={key}>
            <span className={`modality-icon m-${key}`}>{meta.icon}</span>
            <span className="modality-label">{meta.label}</span>
            <span className="modality-pct">{unused ? "Not used" : `${pct}%`}</span>
            <span className="modality-blurb">
              {unused ? "Excluded from this model" : meta.blurb}
            </span>
            {!unused && (
              <span className="modality-track" aria-hidden="true">
                <span className={`modality-fill m-${key}`} style={{ width: `${pct}%` }} />
              </span>
            )}
            {typeof own === "number" && typeof cut === "number" && (
              <span className="modality-detail">
                On its own: {pct1(own)} (cut-off {pct1(cut)}) —{" "}
                <strong>{own >= cut ? "depression pattern" : "no depression pattern"}</strong>
                {typeof weight === "number" && weight < 0 && (
                  <>
                    . The final model gives this part a negative weight: in testing it
                    did not improve predictions, so it counts for little.
                  </>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
