import { getLanguages } from "../api/reference";
import useReferenceData from "../hooks/useReferenceData";

/**
 * The language an interview will be conducted in.
 *
 * Languages the platform cannot score are shown, but disabled and labelled.
 * Hiding them would read as an oversight — "why isn't Marathi here?" — while a
 * disabled option with a reason answers the question in place, and makes it
 * visible that the gap is a missing model rather than a missing feature.
 *
 * This is the one control on the platform that decides whether a prediction
 * means anything, so it is deliberately not a quiet dropdown at the bottom of
 * a form. See the ML service's languages.py for why English-only models cannot
 * simply be pointed at another language.
 */
export default function LanguageSelect({ id, value, onChange }) {
  const { data: languages, loading, error } = useReferenceData(getLanguages);

  const scorable = languages.filter((l) => l.scoring);
  const unavailable = languages.filter((l) => !l.scoring);
  const selected = languages.find((l) => l.code === value);

  return (
    <>
      <select
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        required
      >
        {loading && <option value="">Loading languages...</option>}

        {scorable.length > 0 && (
          <optgroup label="Available for analysis">
            {scorable.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName === l.name ? l.name : `${l.name} — ${l.nativeName}`}
              </option>
            ))}
          </optgroup>
        )}

        {unavailable.length > 0 && (
          <optgroup label="No model trained yet">
            {unavailable.map((l) => (
              <option key={l.code} value={l.code} disabled>
                {l.nativeName === l.name ? l.name : `${l.name} — ${l.nativeName}`}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {error && <p className="field-error">{error}</p>}

      {selected && (
        <p className="hint">
          The interview will be transcribed as {selected.name}, and only the{" "}
          {selected.name} models will be used to analyse it.
        </p>
      )}

      {unavailable.length > 0 && (
        <p className="hint muted">
          {unavailable.length} language{unavailable.length === 1 ? " is" : "s are"} listed but greyed
          out. Those can be transcribed, but no model has been trained on them yet — and the English
          models cannot stand in, because their word features and sentence encoder only work on
          English. An administrator can add a language by training and activating its models.
        </p>
      )}
    </>
  );
}
