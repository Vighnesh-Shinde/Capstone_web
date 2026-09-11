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
 *  - It says what the computer looked at — the words, the voice and the face —
 *    and states outright that it does not understand the conversation the way a
 *    person does. It compares patterns; it does not know anyone's situation.
 *    (An earlier version said it "did not understand what was said", which was
 *    never true: the text model always read the words.)
 *  - It gives the error rate as "wrong about 3 times in every 10" rather than an
 *    accuracy percentage. A number people can picture is harder to over-trust.
 *    It is the held-out test result of the DAIC-WOZ models (70% accuracy).
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
          participant&apos;s voice from everyone else&apos;s. It then looked at{" "}
          <strong>what</strong> they said — the kinds of words they used and the
          general meaning of their answers — and <strong>how</strong> they said
          it: how long their answers were, and how loud and steady their voice
          was. When the video is used, it also measured small movements of their{" "}
          <strong>face</strong>, such as frowning or smiling, and where they looked.
        </p>
        <p>
          <strong>It does not understand the conversation the way a person does.</strong>{" "}
          It only compares these patterns with patterns from other interviews. It
          does not know anybody&apos;s situation, and it cannot tell why someone
          spoke or looked the way they did.
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
          talk will often speak in exactly the same way. The camera, the lighting and
          the microphone also change what it measures.
        </p>
        <p className="plain-caution">
          In testing, this tool was <strong>wrong about 3 times in every 10</strong>. It cannot
          decide anything on its own. The counsellor&apos;s own judgement is what
          counts, and it is recorded separately on this report.
        </p>
      </div>
    </div>
  );
}
