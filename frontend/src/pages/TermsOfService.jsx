import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="page prose-page">
      <h1>Terms of use</h1>

      <div className="alert alert-warning">
        <strong>Review before deployment.</strong> These terms describe how the software
        is intended to be used. They have not been reviewed by a lawyer and do not name a
        legal entity. Whoever operates this platform is responsible for completing and
        reviewing them before granting access to real clinicians.
      </div>

      <h2>What this platform is</h2>
      <p>
        A screening-support tool for qualified mental-health practitioners. It analyses an
        interview recording and produces an indicator to inform — never to replace —
        professional judgement.
      </p>

      <h2>What it is not</h2>
      <ul>
        <li>It is not a medical device, and has not been evaluated by any regulator.</li>
        <li>It does not diagnose depression or any other condition.</li>
        <li>It does not detect crisis or suicide risk.</li>
        <li>It is not a substitute for clinical assessment, supervision, or judgement.</li>
      </ul>

      <h2>Who may use it</h2>
      <p>
        Access is granted only to practitioners whose credentials have been reviewed and
        approved by an administrator. Accounts are personal and must not be shared.
        Sharing an account breaks the audit trail that protects both you and the people
        you see.
      </p>

      <h2>Your responsibilities as a counselor</h2>
      <ul>
        <li>
          Obtain informed consent before recording. Record accurately what was consented
          to — the consent boxes are a legal record, not a formality.
        </li>
        <li>
          Use a pseudonymous participant reference. Do not enter real names.
        </li>
        <li>
          Treat every output as one input among many. Never present a score to a
          participant as a diagnosis.
        </li>
        <li>
          Follow your own organisation&apos;s clinical and risk protocols, which take
          precedence over anything shown here.
        </li>
        <li>
          Upload only recordings you are entitled to upload.
        </li>
      </ul>

      <h2>Accuracy</h2>
      <p>
        The model is wrong roughly one time in four, in both directions — see{" "}
        <Link to="/help">how it works</Link> for the measured figures and the population
        it was trained on. Acting on its output without independent clinical judgement is
        a misuse of this tool.
      </p>

      <h2>Suspension</h2>
      <p>
        An administrator may suspend an account at any time, including for misuse.
        Suspension revokes access; it does not delete clinical records already created.
      </p>

      <h2>Liability</h2>
      <p>
        The software is provided as-is, without warranty. Clinical responsibility for
        every decision rests with the practitioner who makes it.
      </p>
    </div>
  );
}
