import { Link } from "react-router-dom";

/**
 * Escalation guidance for a counselor who encounters acute risk during a session.
 *
 * The specific helpline numbers are intentionally NOT hardcoded here. Publishing
 * a wrong or out-of-date crisis number is worse than publishing none — the
 * operator must fill in numbers they have personally verified for their own
 * region. See README "Before deployment".
 */
export default function CrisisResources() {
  return (
    <div className="page prose-page">
      <h1>Crisis resources</h1>
      <p className="lede">
        If you believe someone is in immediate danger, act on that judgement now. Do not
        wait for this platform to finish processing a recording.
      </p>

      <div className="alert alert-error">
        <strong>Immediate danger:</strong> contact your local emergency services
        straight away. In India dial <strong>112</strong> for the national emergency
        number. This platform is not monitored and cannot summon help.
      </div>

      <h2>This tool does not detect crisis</h2>
      <p>
        The screening model was trained to estimate whether depression indicators are
        present across a whole interview. It was <strong>not</strong> trained to detect
        suicidal ideation, self-harm risk, or acute crisis, and it does not flag them.
        A low score is not evidence that someone is safe.
      </p>
      <p>
        Risk assessment remains entirely your clinical responsibility. Nothing on a
        report replaces asking directly.
      </p>

      <h2>If a participant discloses risk during a session</h2>
      <ol>
        <li>Stay with them. Do not end the session to go and check a report.</li>
        <li>Ask directly and plainly about thoughts of suicide or self-harm.</li>
        <li>
          Follow your organisation&apos;s own risk protocol — that protocol takes
          precedence over anything this platform shows you.
        </li>
        <li>Arrange immediate escalation before the person leaves.</li>
        <li>
          Record what happened in your own clinical records. The notes field on a
          session is a convenience, not a clinical record system.
        </li>
      </ol>

      <h2>Helplines</h2>
      <div className="alert alert-warning">
        <strong>Not yet configured.</strong> This deployment has not had verified local
        crisis helpline numbers added. Whoever operates this platform must add numbers
        they have personally confirmed are current and staffed, for the region where it
        is used. Placeholder or unverified numbers are deliberately not shown here.
      </div>

      <h2>Looking after yourself</h2>
      <p>
        Reviewing distressing interviews has a cumulative effect. Supervision, peer
        support, and time away from this work are part of doing it safely — for you as
        much as for the people you see.
      </p>

      <p className="hint">
        <Link to="/help">How this platform works</Link>
      </p>
    </div>
  );
}
