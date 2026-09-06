import { useEffect, useState } from "react";
import VoiceRecorder from "./VoiceRecorder";
import { getEnrollmentPassage } from "../api/voiceprint";

/**
 * "Is anyone else in the room?" — and if so, record their voice too.
 *
 * A parent, a spouse, an interpreter. Common in practice, and previously
 * invisible to the pipeline: a third voice would either be folded into the
 * participant's audio features, corrupting the exact signal being measured, or
 * be mistaken for the participant outright.
 *
 * Their recording is used only to subtract them. It is scoped to this one
 * session, never reused at another appointment, and is deleted along with the
 * session's video — which is what the consent line below actually promises, so
 * it has to stay true.
 */
export default function CompanionStep({ companions, onChange }) {
  const [present, setPresent] = useState(null); // null | false | true

  // The same passage the counsellor enrolled with. Shown inline rather than
  // linked: the person reading it is standing in the room right now, and
  // sending the counsellor off to another tab mid-appointment to find the text
  // is the kind of friction that gets a step skipped.
  const [passage, setPassage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getEnrollmentPassage()
      .then((p) => !cancelled && setPassage(p))
      .catch(() => {
        /* The recorder still works; only the on-screen text is missing. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function addCompanion() {
    onChange([...companions, { roleLabel: "", consentGiven: false, audio: null }]);
  }

  function update(index, patch) {
    onChange(companions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function remove(index) {
    const next = companions.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setPresent(false);
  }

  function choosePresent(value) {
    setPresent(value);
    if (value && companions.length === 0) {
      addCompanion();
    } else if (!value) {
      onChange([]);
    }
  }

  const incomplete = companions.filter((c) => !c.audio || !c.consentGiven).length;

  return (
    <>
      <h2>Who else is in the room?</h2>
      <p className="muted">
        The analysis needs to know every voice that is not the participant&apos;s, so it
        can leave them out. If someone speaks during the interview and has not recorded
        their voice, the session cannot be scored.
      </p>

      <div className="tab-switch">
        <button
          type="button"
          className={present === false ? "tab active" : "tab"}
          onClick={() => choosePresent(false)}
        >
          Just me and the participant
        </button>
        <button
          type="button"
          className={present === true ? "tab active" : "tab"}
          onClick={() => choosePresent(true)}
        >
          Someone else is present
        </button>
      </div>

      {present === true && (
        <>
          {companions.map((companion, index) => (
            <div className="doc-row" key={index}>
              <div className="doc-row-head">
                <strong>Person {index + 1}</strong>
                {companions.length > 1 && (
                  <button type="button" className="btn-link" onClick={() => remove(index)}>
                    Remove
                  </button>
                )}
              </div>

              <label className="field-label" htmlFor={`companion-role-${index}`}>
                Who are they to the participant?
              </label>
              <input
                id={`companion-role-${index}`}
                type="text"
                placeholder="e.g. Mother, Interpreter, Support worker"
                value={companion.roleLabel}
                onChange={(e) => update(index, { roleLabel: e.target.value })}
              />
              {/* Not a name. This record needs to tell voices apart, not put a
                  third party who never signed up on file by name. */}
              <p className="hint">
                Please do not enter their name — a description is all that is stored.
              </p>

              <label className="field-label">Ask them to read this aloud</label>
              {passage ? (
                <blockquote className="enrollment-passage">{passage.text}</blockquote>
              ) : (
                <p className="hint">Loading the passage…</p>
              )}
              <p className="hint">
                The same passage you read when you set up your account
                {passage ? ` — about ${passage.approxSeconds} seconds` : ""}. Somewhere
                quiet, with only they speaking.
              </p>

              <VoiceRecorder onRecorded={(file) => update(index, { audio: file })} />

              <div className="checkbox-row">
                <input
                  id={`companion-consent-${index}`}
                  type="checkbox"
                  checked={companion.consentGiven}
                  onChange={(e) => update(index, { consentGiven: e.target.checked })}
                />
                <label htmlFor={`companion-consent-${index}`}>
                  They agree to their voice being recorded so it can be told apart from
                  the participant&apos;s. Their voice is not analysed, and this recording
                  is used for this session only and deleted with it.
                </label>
              </div>
            </div>
          ))}

          <button type="button" className="btn-secondary" onClick={addCompanion}>
            + Someone else is also present
          </button>

          {incomplete > 0 && (
            <div className="alert alert-warning">
              {incomplete === 1
                ? "One person still needs a recording and their agreement."
                : `${incomplete} people still need a recording and their agreement.`}{" "}
              Anyone who speaks without being recorded first will stop this session from
              being scored.
            </div>
          )}
        </>
      )}
    </>
  );
}
