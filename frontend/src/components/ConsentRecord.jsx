/**
 * What the participant actually agreed to for this session.
 *
 * Shown rather than hidden because these four booleans are a legal record: if a
 * participant later asks what they consented to, the answer has to be visible
 * to the counselor who asked them, not buried in a database.
 */
const CONSENT_ITEMS = [
  { key: "consentRecording", label: "Recording this session" },
  { key: "consentAiAnalysis", label: "Automated analysis of the recording" },
  { key: "consentStorage", label: "Storing the recording and report" },
  { key: "consentResearchReuse", label: "Reuse for research and model improvement" },
];

export default function ConsentRecord({ session }) {
  if (!session || !session.consentRecordedAt) {
    return null;
  }

  const withdrawn = Boolean(session.consentWithdrawnAt);

  return (
    <div className="card">
      <h2>Consent record</h2>
      <p className="muted small">
        Captured {new Date(session.consentRecordedAt).toLocaleString()}
        {session.consentVersion ? ` · form ${session.consentVersion}` : ""}
      </p>

      {withdrawn && (
        <div className="alert alert-warning">
          Consent was withdrawn on{" "}
          {new Date(session.consentWithdrawnAt).toLocaleDateString()}. This session has
          been removed from the research dataset. The clinical record is retained.
        </div>
      )}

      <ul className="consent-list">
        {CONSENT_ITEMS.map((item) => {
          const granted = Boolean(session[item.key]);
          return (
            <li key={item.key} className={granted ? "consent-granted" : "consent-declined"}>
              <span aria-hidden="true">{granted ? "✓" : "✕"}</span>
              <span>
                {item.label}
                <span className="visually-hidden">
                  {granted ? " — consented" : " — not consented"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {session.videoDeletedAt && (
        <p className="muted small">
          The recording was deleted on{" "}
          {new Date(session.videoDeletedAt).toLocaleDateString()} under the data retention
          policy. The transcript and report are retained.
        </p>
      )}
    </div>
  );
}
