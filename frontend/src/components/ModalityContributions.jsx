const LABELS = { audio: "Audio", text: "Text", video: "Video" };

export default function ModalityContributions({ modalityContributions }) {
  if (!modalityContributions) return null;

  const entries = ["audio", "text", "video"]
    .map((key) => [key, modalityContributions[key]])
    .filter(([, value]) => value != null);

  if (entries.length === 0) return null;

  return (
    <div className="modality-list">
      {entries.map(([key, value]) => (
        <div className="modality-row" key={key}>
          <div className="factor-header">
            <span className="factor-name">{LABELS[key] ?? key}</span>
            <span className="factor-score positive">{Math.round(value * 100)}%</span>
          </div>
          <div className="factor-bar-track">
            <div className="factor-bar-fill positive" style={{ width: `${Math.round(value * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
