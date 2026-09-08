import { useState } from "react";
import { getLanguages } from "../api/reference";
import useReferenceData from "../hooks/useReferenceData";
import CountrySelect from "./CountrySelect";
import PhoneField from "./PhoneField";

/**
 * The counselor's own editable copy of their professional record.
 *
 * The same fields the application form collects, minus the ones an account
 * holder must not be able to rewrite about themselves. Notably the credential
 * verification dates are displayed here but never editable: a counselor
 * extending their own verification would make the whole check ceremonial.
 */

const GENDER_OPTIONS = ["Woman", "Man", "Non-binary", "Prefer to self-describe", "Prefer not to say"];

const TIMEZONES =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

/** Every field the server accepts, so an emptied box actually clears. */
function toFormState(profile) {
  const p = profile?.profile ?? {};
  return {
    countryCode: p.countryCode || "",
    phoneDialCode: p.phoneDialCode || "",
    phoneNational: p.phoneNational || "",
    addressLine1: p.addressLine1 || "",
    addressLine2: p.addressLine2 || "",
    city: p.city || "",
    stateRegion: p.stateRegion || "",
    postalCode: p.postalCode || "",
    timezone: p.timezone || "",
    gender: p.gender || "",
    dateOfBirth: p.dateOfBirth || "",
    practiceLanguages: p.practiceLanguages || [],
    organization: p.organization || "",
    professionalRole: p.professionalRole || "",
    qualification: p.qualification || "",
    registrationNumber: p.registrationNumber || "",
    licenceAuthority: p.licenceAuthority || "",
    licenceExpiresOn: p.licenceExpiresOn || "",
    yearsOfExperience: p.yearsOfExperience ?? "",
    professionalWebsite: p.professionalWebsite || "",
  };
}

export default function ProfessionalDetailsForm({ profile, name, username, onSave }) {
  const [form, setForm] = useState(() => toFormState(profile));
  const [selfDescribe, setSelfDescribe] = useState(
    GENDER_OPTIONS.includes(profile?.profile?.gender) ? "" : profile?.profile?.gender || ""
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: languages } = useReferenceData(getLanguages);

  // An unlisted stored value means the counselor self-described. Showing the
  // dropdown as blank would silently discard their answer on the next save.
  const genderIsCustom = form.gender && !GENDER_OPTIONS.includes(form.gender);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleLanguage(code) {
    setForm((prev) => ({
      ...prev,
      practiceLanguages: prev.practiceLanguages.includes(code)
        ? prev.practiceLanguages.filter((c) => c !== code)
        : [...prev.practiceLanguages, code],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const payload = {
        name,
        username: username || null,
        ...form,
        gender:
          form.gender === "Prefer to self-describe" || genderIsCustom
            ? selfDescribe || null
            : form.gender || null,
        // Empty strings must reach the server as nulls, or a cleared date field
        // arrives as "" and fails to parse instead of clearing the value.
        dateOfBirth: form.dateOfBirth || null,
        licenceExpiresOn: form.licenceExpiresOn || null,
        yearsOfExperience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
      };
      await onSave(payload);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Professional profile</h2>
      <p className="muted">
        Shown to administrators reviewing your account. Your credential verification
        dates are set by an administrator and cannot be changed here.
      </p>

      {profile.verificationExpired && (
        <div className="alert alert-warning">
          Your credential verification lapsed on{" "}
          {new Date(profile.verifiedUntil).toLocaleDateString()}. Contact an administrator
          to have it renewed.
        </div>
      )}

      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="p-role">Professional role</label>
          <input id="p-role" type="text" value={form.professionalRole}
                 onChange={(e) => update("professionalRole", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-qual">Qualification</label>
          <input id="p-qual" type="text" value={form.qualification}
                 onChange={(e) => update("qualification", e.target.value)} />
        </div>
      </div>

      <label className="field-label" htmlFor="p-org">Organization / practice</label>
      <input id="p-org" type="text" value={form.organization}
             onChange={(e) => update("organization", e.target.value)} />

      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="p-auth">Licensing body</label>
          <input id="p-auth" type="text" value={form.licenceAuthority}
                 onChange={(e) => update("licenceAuthority", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-reg">Registration number</label>
          <input id="p-reg" type="text" value={form.registrationNumber}
                 onChange={(e) => update("registrationNumber", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-lic-exp">Licence valid until</label>
          <input id="p-lic-exp" type="date" value={form.licenceExpiresOn}
                 onChange={(e) => update("licenceExpiresOn", e.target.value)} />
        </div>
      </div>

      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="p-years">Years in practice</label>
          <input id="p-years" type="number" min="0" max="80" value={form.yearsOfExperience}
                 onChange={(e) => update("yearsOfExperience", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-web">Website</label>
          <input id="p-web" type="url" placeholder="https://" value={form.professionalWebsite}
                 onChange={(e) => update("professionalWebsite", e.target.value)} />
        </div>
      </div>

      <label className="field-label">Languages you counsel in</label>
      <div className="chip-choices">
        {languages.map((l) => (
          <label key={l.code}
                 className={form.practiceLanguages.includes(l.code) ? "chip-choice selected" : "chip-choice"}>
            <input type="checkbox" checked={form.practiceLanguages.includes(l.code)}
                   onChange={() => toggleLanguage(l.code)} />
            {l.name}
          </label>
        ))}
      </div>

      <h3>Contact &amp; location</h3>

      <label className="field-label" htmlFor="p-country">Country of practice</label>
      <CountrySelect id="p-country" value={form.countryCode}
                     onChange={(v) => update("countryCode", v)} />

      <label className="field-label" htmlFor="p-phone-number">Phone number</label>
      <PhoneField idPrefix="p-phone" dialCode={form.phoneDialCode} nationalNumber={form.phoneNational}
                  countryCode={form.countryCode}
                  onDialCodeChange={(v) => update("phoneDialCode", v)}
                  onNationalNumberChange={(v) => update("phoneNational", v)} />

      <label className="field-label" htmlFor="p-addr1">Practice address</label>
      <input id="p-addr1" type="text" placeholder="Street address" value={form.addressLine1}
             onChange={(e) => update("addressLine1", e.target.value)} />
      {/* Second address line, visually continuing the field above it. It gets
          its own accessible name rather than a visible label — a screen reader
          otherwise announces it as an unnamed text box, while a sighted user
          reads it as part of "Practice address" from position alone. */}
      <input id="p-addr2" type="text" placeholder="Building, floor, unit (optional)"
             aria-label="Practice address, second line"
             value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} />

      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="p-city">City</label>
          <input id="p-city" type="text" value={form.city}
                 onChange={(e) => update("city", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-state">State / province / region</label>
          <input id="p-state" type="text" value={form.stateRegion}
                 onChange={(e) => update("stateRegion", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-post">Postal code</label>
          <input id="p-post" type="text" value={form.postalCode}
                 onChange={(e) => update("postalCode", e.target.value)} />
        </div>
      </div>

      <label className="field-label" htmlFor="p-tz">Time zone</label>
      {TIMEZONES.length > 0 ? (
        <select id="p-tz" value={form.timezone} onChange={(e) => update("timezone", e.target.value)}>
          <option value="">Select a time zone</option>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      ) : (
        <input id="p-tz" type="text" placeholder="Asia/Kolkata" value={form.timezone}
               onChange={(e) => update("timezone", e.target.value)} />
      )}

      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="p-gender">Gender</label>
          <select id="p-gender" value={genderIsCustom ? "Prefer to self-describe" : form.gender}
                  onChange={(e) => update("gender", e.target.value)}>
            <option value="">Prefer not to say</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          {(form.gender === "Prefer to self-describe" || genderIsCustom) && (
            <input type="text" placeholder="How you describe yourself" value={selfDescribe}
                   onChange={(e) => setSelfDescribe(e.target.value)} />
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="p-dob">Date of birth</label>
          <input id="p-dob" type="date" value={form.dateOfBirth}
                 onChange={(e) => update("dateOfBirth", e.target.value)} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save professional profile"}
      </button>
    </form>
  );
}
