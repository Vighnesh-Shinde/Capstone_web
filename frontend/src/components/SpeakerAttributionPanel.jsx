/**
 * How the platform decided whose voice it was reading.
 *
 * This belongs on the report rather than buried in a log. The audio model was
 * trained on participant speech alone, so identifying the wrong speaker does
 * not produce a wrong-looking result — it produces a perfectly normal report
 * about the wrong person. A counselor who can see the evidence can catch that;
 * one who is only shown a percentage cannot.
 *
 * Similarity is shown as a number rather than a bar or a word. "0.81" invites
 * the right question — is that high? — where "Strong match" quietly answers it
 * on the reader's behalf.
 */
export default function SpeakerAttributionPanel({ session }) {
  if (!session) return null;

  const legacy = session.speakerAttribution === "LEGACY_DURATION_HEURISTIC";
  const similarities = session.speakerSimilarities || {};
  const companions = session.companions || [];
  const rows = Object.entries(similarities);

  return (
    <div className="card">
      <h2>Who was analysed</h2>

      {legacy ? (
        <div className="alert alert-warning">
          <strong>This session predates voice identification.</strong> The participant
          was chosen by assuming they were the speaker who talked most, which is
          unreliable when a participant is withdrawn and the counselor carries the
          conversation. Read this report with the possibility that the two speakers were
          swapped.
        </div>
      ) : (
        <p className="muted">
          Each voice in the recording was matched against the recordings made before the
          interview. The participant is the voice that matched none of them, and only
          their speech was analysed.
        </p>
      )}

      <dl className="detail-list">
        <div>
          <dt>Participant</dt>
          <dd>{session.participantSpeaker || <span className="muted">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Counselor</dt>
          <dd>{session.counselorSpeaker || <span className="muted">Not recorded</span>}</dd>
        </div>
        {companions.length > 0 && (
          <div>
            <dt>Others present</dt>
            <dd>
              {companions.map((c) => c.roleLabel).join(", ")}
              {/* Worth stating plainly: people assume anyone recorded is being
                  assessed, and here the opposite is true. */}
              <div className="muted small">
                Their speech was excluded from the analysis, not assessed.
              </div>
            </dd>
          </div>
        )}
      </dl>

      {rows.length > 0 && (
        <>
          <h3>Match scores</h3>
          <p className="muted small">
            Cosine similarity between each voice in the recording and each enrolled
            voice, from -1 to 1. A voice matching nothing strongly is the participant.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Voice in recording</th>
                  {Object.keys(rows[0][1]).map((role) => (
                    <th key={role}>{formatRole(role, companions)}</th>
                  ))}
                  <th>Identified as</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, scores]) => (
                  <tr key={label}>
                    <td className="mono">{label}</td>
                    {Object.entries(scores).map(([role, value]) => (
                      <td key={role} className="mono">{value.toFixed(2)}</td>
                    ))}
                    <td>{identify(label, session, companions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function formatRole(role, companions) {
  if (role === "counselor") return "You";
  const match = /^companion:(\d+)$/.exec(role);
  if (match) {
    const companion = companions[Number(match[1])];
    return companion?.roleLabel || `Companion ${Number(match[1]) + 1}`;
  }
  return role;
}

function identify(label, session, companions) {
  if (label === session.participantSpeaker) return "Participant — analysed";
  if (label === session.counselorSpeaker) return "You — excluded";
  const index = companions.findIndex((c) => c.diarizedLabel === label);
  if (index >= 0) return `${companions[index].roleLabel} — excluded`;
  return "Excluded";
}
