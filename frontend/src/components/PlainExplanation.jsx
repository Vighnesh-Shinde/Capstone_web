import { plainSummary } from "../lib/featureGlossary";

/**
 * The report in ordinary language, written to be read aloud to a participant.
 *
 * The rest of the report is written for a clinician. This section is written
 * for the person the report is about, because "spec rms db p10 +4.34" tells
 * them nothing, and a result they cannot interrogate is one they can only
 * accept or reject on faith.
 *
 * Three things it is careful about:
 *
 *  - It says what the computer LISTENED TO (timing, volume, pitch), and states
 *    outright that it did not understand the meaning of anything said. People
 *    reasonably assume a computer that produced a mental-health result
 *    understood their words, and it did not.
 *  - It gives the error rate as "wrong about 1 time in 4" rather than an
 *    accuracy percentage. A number people can picture is harder to over-trust.
 *  - It never tells the participant what to do. That is the counsellor's
 *    territory, and a screening tool stepping into it would be overreach.
 */
export default function PlainExplanation({ factors, prediction }) {
  const summary = plainSummary(factors, prediction);
  if (!summary) return null;

  const hasObservations = summary.observations.length > 0;

  return (
    <div className="card plain-explanation">
      <h2>In plain words</h2>
      <p className="muted">
        Written to be read with the participant, if that would help.
      </p>

      <div className="plain-block">
        <h3>What the computer did</h3>
        <p>
          It listened to the recording of this conversation and separated the
          participant&apos;s voice from everyone else&apos;s. It then measured{" "}
          <strong>how</strong> they spoke — how quickly they answered, how long
          their answers were, how loud and how steady their voice was.
        </p>
        <p>
          <strong>It did not understand what was said.</strong> It does not know
          what the conversation was about, and it has not judged anybody&apos;s
          words or their situation.
        </p>
      </div>

      <div className="plain-block">
        <h3>What it noticed</h3>
        {hasObservations ? (
          <>
            <p>Compared with the recordings it learned from, this session had:</p>
            <ul>
              {summary.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>No single measurement stood out strongly in this session.</p>
        )}
      </div>

      <div className="plain-block">
        <h3>What that means — and does not mean</h3>
        {/* Without observations to point at, "patterns like these" refers to
            nothing. The claim is worded generally in that case rather than
            dangling. */}
        <p>
          {hasObservations ? "Patterns like these were" : "Patterns of this kind are"}{" "}
          <em>more common</em> among people who were depressed in the recordings this
          system was trained on. That is all it means. It is a similarity to a pattern,{" "}
          <strong>not a diagnosis, and not a measure of how someone feels</strong>.
        </p>
        <p>
          There are ordinary reasons for {hasObservations ? "every one of these" : "all of them"}.
          Somebody who is tired, unwell, shy, distracted, or simply not in the mood to
          talk will often speak in exactly the same way.
        </p>
        <p className="plain-caution">
          This tool is <strong>wrong about 1 time in every 4</strong>. It cannot
          decide anything on its own. The counsellor&apos;s own judgement is what
          counts, and it is recorded separately on this report.
        </p>
      </div>
    </div>
  );
}
