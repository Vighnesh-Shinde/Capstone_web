import { Link } from "react-router-dom";

export default function HelpGuide() {
  return (
    <div className="page prose-page">
      <h1>How this platform works</h1>
      <p className="lede">
        What happens to a recording after you upload it, what the result means, and —
        just as importantly — what it does not mean.
      </p>

      <h2>The pipeline</h2>
      <ol>
        <li>
          <strong>You upload an interview recording</strong> and record what the
          participant consented to.
        </li>
        <li>
          <strong>The audio is transcribed</strong> with word-level timings.
        </li>
        <li>
          <strong>Speakers are separated.</strong> Your voice and the participant&apos;s
          are split apart, because the model was trained only on participant speech.
          Leaving your questions in would let it read the interview structure instead of
          the person.
        </li>
        <li>
          <strong>Two models run.</strong> One reads the words the participant used; the
          other listens to how they spoke — pauses, response delays, pitch variation,
          loudness.
        </li>
        <li>
          <strong>The two are combined</strong> into one score, weighted heavily towards
          the text model, which is the stronger signal.
        </li>
        <li>
          <strong>You review the report</strong> and record your own assessment, which is
          stored separately from the model&apos;s.
        </li>
      </ol>
      <p className="muted">
        Processing runs on CPU and takes several minutes per recording. You can navigate
        away — it continues in the background.
      </p>

      <h2>What the score means</h2>
      <p>
        The confidence score is the model&apos;s estimate that indicators associated with
        depression are present across the interview. Above the decision threshold, the
        session is flagged for follow-up.
      </p>
      <p>
        <strong>It is not a diagnosis, and not a severity rating.</strong> A score of 80%
        does not mean someone is more depressed than a score of 60% — it means the model
        is more confident that indicators are present.
      </p>

      <h2>How often it is wrong</h2>
      <p>
        On held-out test data the fused model reached roughly <strong>0.74 balanced
        accuracy</strong> — it is wrong about one time in four, in both directions. It
        misses genuinely depressed participants, and it flags people who are not
        depressed.
      </p>
      <p>
        It was trained on 107 participants from a research corpus of clinical interviews
        conducted in English, in a US research setting. Every way your interviews differ
        from that — language, accent, culture, recording quality, interview style — is a
        reason to trust it less.
      </p>

      <h2>Why your assessment is recorded separately</h2>
      <p>
        Your professional judgement is stored independently of the model&apos;s
        prediction, never overwriting it. That keeps the record honest about who
        concluded what, and it is what makes disagreements visible — on a
        participant&apos;s history, sessions where you differed from the model are marked.
      </p>
      <p>
        Those disagreements are the most valuable data this platform collects. They are
        what a future retrained model learns from.
      </p>

      <h2>Reading a participant&apos;s history</h2>
      <p>
        A single report is a snapshot. The <Link to="/participants">participant history
        view</Link> plots scores across sessions, which is usually more informative:
        direction of travel matters more than any one number.
      </p>

      <h2>What it cannot do</h2>
      <ul>
        <li>It does not detect suicide risk or crisis — see <Link to="/crisis-resources">crisis resources</Link>.</li>
        <li>It does not diagnose, and it does not rate severity.</li>
        <li>It does not analyse facial expression or body language.</li>
        <li>It cannot interpret anything said outside the recording.</li>
      </ul>
    </div>
  );
}
