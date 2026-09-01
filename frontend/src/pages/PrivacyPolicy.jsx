/**
 * Plain-language description of what this deployment actually does with data.
 *
 * Written to match the system's real behaviour, not as a legal template: every
 * claim here corresponds to something the code genuinely does. It is NOT legal
 * advice, and the operator must have it reviewed before real clinical use —
 * that caveat is stated on the page itself rather than hidden in a comment.
 */
export default function PrivacyPolicy() {
  return (
    <div className="page prose-page">
      <h1>Privacy notice</h1>

      <div className="alert alert-warning">
        <strong>Review before deployment.</strong> This notice describes what the
        software does. It has not been reviewed by a lawyer or a data protection
        officer, and it does not yet name a data controller. Whoever operates this
        platform is responsible for having it reviewed and completed before real
        participant data is processed.
      </div>

      <h2>What is collected</h2>
      <ul>
        <li>
          <strong>Interview recordings</strong> uploaded by a counselor, containing the
          voices of both the counselor and the participant.
        </li>
        <li>
          <strong>A transcript</strong> produced automatically from that recording.
        </li>
        <li>
          <strong>Derived measurements</strong> — numerical features describing word use
          and speech patterns. These are not human-readable and cannot be played back as
          audio.
        </li>
        <li>
          <strong>A participant reference</strong> chosen by the counselor. Counselors are
          asked to use a pseudonymous code rather than a real name.
        </li>
        <li>
          <strong>Counselor accounts</strong> — name, email, and professional details
          submitted when requesting access.
        </li>
        <li>
          <strong>An audit trail</strong> of who accessed or acted on what.
        </li>
      </ul>

      <h2>What it is used for</h2>
      <p>
        Recordings are analysed to produce a screening-support report for the counselor
        who uploaded them. That is the only automatic use.
      </p>
      <p>
        A session may additionally be added to a research dataset used to improve the
        model — but only where the participant explicitly consented to research reuse,
        and only after an administrator has separately reviewed and approved it. Consent
        is recorded per session, with a timestamp.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>The counselor who created the session</strong> — and no other counselor.
          Access is enforced server-side on every request, not merely hidden in the
          interface.
        </li>
        <li>
          <strong>Administrators</strong> can see sessions submitted for research review,
          and account information. Administrator actions are audit-logged.
        </li>
      </ul>

      <h2>How long it is kept</h2>
      <p>
        Video recordings are deleted automatically after a retention period set by the
        operator. Transcripts, derived measurements, and reports are retained, because
        they are what the clinical record and any future model retraining depend on.
      </p>
      <p>
        Deleting the video does not remove the report — the report is the clinical output
        and outlives the recording it came from.
      </p>

      <h2>Withdrawing consent and erasure</h2>
      <p>
        A participant may withdraw consent at any time by telling the counselor who
        recorded them. Withdrawal removes the session from the research dataset. A
        participant may also request that all of their data be erased, which removes
        their sessions, recordings, transcripts, derived measurements, and reports.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are stored hashed, never in plaintext. Access requires authentication,
        and every request is checked against the requester&apos;s role and ownership of
        the record. Sensitive actions are recorded in an audit log.
      </p>
      <p>
        No system is perfectly secure. This one runs on infrastructure chosen by its
        operator, and its real-world security depends on how that infrastructure is
        configured and maintained.
      </p>

      <h2>Automated decision-making</h2>
      <p>
        The model produces a score. It does not make decisions. Every clinical
        conclusion is made by a qualified human, whose own assessment is recorded
        separately from the model&apos;s output.
      </p>
    </div>
  );
}
