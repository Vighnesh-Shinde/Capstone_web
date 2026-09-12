/**
 * Which of the participant's own sentences moved the text score.
 *
 * The text model reads pooled sentence meanings, so its strongest factor —
 * "what was said, overall" — is true but unquotable: a counsellor cannot see
 * WHICH answers produced it. The ML service splits that score back across the
 * participant's sentences, exactly for three of the four ways it pools them,
 * and reports the fourth as an unattributed remainder rather than spreading it
 * around to make the totals look complete.
 *
 * The sentences are the participant's own words, already stored on the report
 * as the transcript, so nothing new is exposed here.
 */
export default function SentenceAttributions({ sentences, remainder }) {
  if (!sentences || sentences.length === 0) return null;

  const strongest = Math.max(...sentences.map((s) => Math.abs(s.contribution))) || 1;

  return (
    <div className="card">
      <h2>Which answers moved the result</h2>
      <p className="muted">
        The model reads the meaning of whole answers. These are the participant&apos;s own
        sentences that moved its score the most — toward depressed, or away from it.
      </p>

      <ul className="sentence-list">
        {sentences.map((sentence, index) => {
          const toward = sentence.contribution > 0;
          return (
            <li key={index} className={toward ? "sentence-toward" : "sentence-away"}>
              <span className="sentence-quote">&ldquo;{sentence.text}&rdquo;</span>
              <span className="sentence-meta">
                {toward ? "pushed toward depressed" : "pushed away from depressed"}
              </span>
              <span className="sentence-track" aria-hidden="true">
                <span
                  className="sentence-fill"
                  style={{ width: `${Math.round((Math.abs(sentence.contribution) / strongest) * 100)}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>

      {typeof remainder === "number" && Math.abs(remainder) > 0.0005 && (
        <p className="small muted">
          One part of the text score — how much the meaning of the answers varied across the
          interview — cannot be traced to any single sentence. It is left out of this list
          rather than divided up arbitrarily.
        </p>
      )}
    </div>
  );
}
