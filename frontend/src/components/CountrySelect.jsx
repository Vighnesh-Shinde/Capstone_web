import { getCountries } from "../api/reference";
import useReferenceData from "../hooks/useReferenceData";

/**
 * Country picker, backed by the server's ISO list.
 *
 * A native <select> rather than a searchable combobox: it is 245 options, but
 * every browser already gives a native select type-ahead, keyboard navigation,
 * and a mobile wheel picker for free — and gets them right for screen readers,
 * which a hand-rolled listbox usually does not.
 */
export default function CountrySelect({ id, value, onChange, required = false, disabled = false }) {
  const { data: countries, loading, error } = useReferenceData(getCountries);

  return (
    <>
      <select
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled || loading}
      >
        <option value="">{loading ? "Loading countries..." : "Select a country"}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name}
          </option>
        ))}
      </select>
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
