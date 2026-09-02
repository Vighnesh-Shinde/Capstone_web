import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getProfile } from "../api/profile";

/**
 * Escalation guidance for a counselor who encounters acute risk during a session.
 *
 * No helpline number is hardcoded, and the emergency number shown is derived
 * from the counselor's own country of practice rather than assumed. The old
 * version told everyone to dial 112 "in India", which is correct guidance
 * pointed at the wrong person the moment this platform runs anywhere else — and
 * a wrong crisis number is worse than no crisis number, because it is trusted.
 *
 * The numbers below are the general emergency services number for each country,
 * not a mental-health helpline. Those vary far more, change more often, and
 * cannot be responsibly published without someone verifying each one, so the
 * page asks the operator to add them instead of guessing.
 */

/**
 * General emergency numbers. Kept small and explicitly incomplete: every entry
 * here is one somebody has to be willing to stand behind, and an unlisted
 * country falls back to honest wording rather than a plausible-looking number.
 */
const EMERGENCY_NUMBERS = {
  IN: "112",
  GB: "999 or 112",
  IE: "112 or 999",
  US: "911",
  CA: "911",
  AU: "000",
  NZ: "111",
  ZA: "112 (mobile) or 10111",
  KE: "999 or 112",
  NG: "112",
  SG: "995",
  AE: "999",
  MY: "999",
  PH: "911",
  BD: "999",
  LK: "119",
  NP: "100",
  PK: "1122",
  DE: "112",
  FR: "112",
  ES: "112",
  IT: "112",
  NL: "112",
  SE: "112",
  BR: "192",
  JP: "119",
};

export default function CrisisResources() {
  const [country, setCountry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (!cancelled) setCountry(p.profile?.countryCode || null);
      })
      .catch(() => {
        // A failed profile load must not blank this page. The generic wording
        // below is correct everywhere; only the specific number is lost.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const emergencyNumber = country ? EMERGENCY_NUMBERS[country] : null;

  return (
    <div className="page prose-page">
      <h1>Crisis resources</h1>
      <p className="lede">
        If you believe someone is in immediate danger, act on that judgement now. Do not
        wait for this platform to finish processing a recording.
      </p>

      <div className="alert alert-error">
        <strong>Immediate danger:</strong>{" "}
        {emergencyNumber ? (
          <>
            contact your local emergency services straight away — in your registered
            country of practice that is <strong>{emergencyNumber}</strong>.
          </>
        ) : (
          <>
            contact your local emergency services straight away, using the number for the
            country you are in. This platform does not know your country
            {country ? "'s emergency number" : " — set it on your profile"} and will not
            guess one.
          </>
        )}{" "}
        This platform is not monitored and cannot summon help.
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
        they have personally confirmed are current and staffed, for every region where it
        is used — a helpline number that has been reassigned is worse than none.
        Placeholder or unverified numbers are deliberately not shown here.
      </div>

      <h2>Language</h2>
      <p>
        A person in distress will reach for their first language. If the participant is
        more fluent in a language you do not share, arrange an interpreter or a
        colleague before you need one — not during a crisis. This is separate from which
        language the platform can analyse; the interview matters more than the report.
      </p>

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
