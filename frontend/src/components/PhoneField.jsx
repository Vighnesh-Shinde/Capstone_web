import { useEffect, useMemo } from "react";
import { getCountries } from "../api/reference";
import useReferenceData from "../hooks/useReferenceData";

/**
 * International phone entry: dial code and national number, kept separate.
 *
 * One free-text box cannot tell "+91 98765 43210" from "098765 43210", and a
 * clinic in Nairobi calling a counselor in Pune needs the first form. Splitting
 * them is also what lets the server normalise to E.164 and check the length is
 * plausible for that country.
 *
 * The dial-code list is deduplicated by code and labelled with one country
 * each: +1 covers the US, Canada and twenty Caribbean nations, and a picker
 * with twenty identical "+1" rows is worse than one.
 */
export default function PhoneField({
  idPrefix,
  dialCode,
  nationalNumber,
  countryCode,
  onDialCodeChange,
  onNationalNumberChange,
}) {
  const { data: countries, loading } = useReferenceData(getCountries);

  const dialCodes = useMemo(() => {
    const seen = new Map();
    for (const c of countries) {
      if (!c.dialCode) continue;
      if (!seen.has(c.dialCode)) {
        seen.set(c.dialCode, { dialCode: c.dialCode, label: `${c.flag} ${c.dialCode}`, name: c.name });
      }
    }
    return [...seen.values()].sort(
      (a, b) => Number(a.dialCode.slice(1)) - Number(b.dialCode.slice(1))
    );
  }, [countries]);

  // Selecting a country fills the dial code in, but only while the field is
  // still empty. Overwriting a code the user typed themselves would quietly
  // corrupt the number of anyone whose practice country and phone number are
  // in different countries, which is common for locums and border regions.
  useEffect(() => {
    if (dialCode || !countryCode || countries.length === 0) return;
    const match = countries.find((c) => c.code === countryCode);
    if (match?.dialCode) {
      onDialCodeChange(match.dialCode);
    }
  }, [countryCode, countries, dialCode, onDialCodeChange]);

  return (
    <div className="phone-field">
      <select
        id={`${idPrefix}-dial`}
        className="phone-dial"
        aria-label="Country dialling code"
        value={dialCode || ""}
        onChange={(e) => onDialCodeChange(e.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? "..." : "Code"}</option>
        {dialCodes.map((d) => (
          <option key={d.dialCode} value={d.dialCode}>
            {d.label}
          </option>
        ))}
      </select>

      <input
        id={`${idPrefix}-number`}
        className="phone-number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label="Phone number without the country code"
        placeholder="98765 43210"
        value={nationalNumber || ""}
        onChange={(e) => onNationalNumberChange(e.target.value)}
      />
    </div>
  );
}
