import { useState } from "react";
import { Link } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { submitCounselorApplication } from "../api/applications";
import { getDocumentTypes, getLanguages } from "../api/reference";
import useReferenceData from "../hooks/useReferenceData";
import CountrySelect from "../components/CountrySelect";
import PhoneField from "../components/PhoneField";

/**
 * Counselor access request.
 *
 * Split into four steps rather than one long scroll. The old single form asked
 * for ten fields; this asks for closer to twenty-five, and twenty-five inputs
 * in one column is where people start abandoning or typing anything to get
 * through. Steps also let each stage explain itself — an applicant is more
 * willing to enter a licence number when the screen says who reads it.
 *
 * Only four fields are actually required: name, email, password, and the
 * country of practice. Everything else is optional on purpose. An administrator
 * judging an application is better served by an honest gap than by a mandatory
 * field somebody filled in with "N/A" to get past it.
 */

const STEPS = [
  { key: "account", label: "Account" },
  { key: "professional", label: "Professional details" },
  { key: "contact", label: "Contact & location" },
  { key: "documents", label: "Documents" },
];

const initialForm = {
  fullName: "",
  email: "",
  password: "",

  countryCode: "",
  phoneDialCode: "",
  phoneNational: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateRegion: "",
  postalCode: "",
  // Prefilled from the browser: it is right far more often than it is wrong,
  // and a wrong guess is one dropdown change rather than a search through 400
  // zone names. Guarded because older browsers can return undefined here.
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",

  gender: "",
  dateOfBirth: "",

  organization: "",
  professionalRole: "",
  qualification: "",
  registrationNumber: "",
  licenceAuthority: "",
  licenceExpiresOn: "",
  yearsOfExperience: "",
  professionalWebsite: "",
  practiceLanguages: [],

  experience: "",
  additionalInfo: "",
};

/**
 * Offered as suggestions, never enforced. A fixed list would either be wrong
 * for most of the world or would need every country's regulator enumerated,
 * and free text with a hint is honest about which of those we can deliver.
 */
const LICENCE_HINTS = {
  IN: "e.g. Rehabilitation Council of India (RCI), or your State Medical Council",
  GB: "e.g. HCPC, BACP, UKCP, BPS",
  US: "e.g. your state licensing board (BBS, LPCC, LMHC)",
  AU: "e.g. AHPRA, PACFA, ACA",
  CA: "e.g. your provincial college of psychologists",
  ZA: "e.g. HPCSA",
  KE: "e.g. Counsellors and Psychologists Board",
  AE: "e.g. DHA, DOH, or MOHAP",
  SG: "e.g. Singapore Register of Psychologists",
  NZ: "e.g. NZPB, NZAC",
};

const GENDER_OPTIONS = ["Woman", "Man", "Non-binary", "Prefer to self-describe", "Prefer not to say"];

const TIMEZONES =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

export default function RequestCounselorAccess() {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [genderSelfDescribe, setGenderSelfDescribe] = useState("");
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const { data: documentTypes } = useReferenceData(getDocumentTypes);
  const { data: languages } = useReferenceData(getLanguages);

  const step = STEPS[stepIndex].key;

  function updateField(key, value) {
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

  function addDocumentRow() {
    setDocuments((prev) => [
      ...prev,
      { file: null, docType: "LICENCE", issuingAuthority: "", documentNumber: "", expiresOn: "" },
    ]);
  }

  function updateDocument(index, patch) {
    setDocuments((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDocument(index) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  function validateStep() {
    if (step === "account") {
      if (!form.fullName.trim()) return "Enter your full name.";
      if (!form.email.trim()) return "Enter your email address.";
      if (form.password.length < 8) return "Choose a password of at least 8 characters.";
    }
    if (step === "contact" && !form.countryCode) {
      return "Select the country you practise in.";
    }
    return "";
  }

  function goNext(e) {
    e.preventDefault();
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError("");
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // The country lives on an earlier step, so a missing one has to send the
    // applicant back to where the field actually is rather than just refusing.
    if (!form.countryCode) {
      setError("Select the country you practise in.");
      setStepIndex(STEPS.findIndex((s) => s.key === "contact"));
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        gender: form.gender === "Prefer to self-describe" ? genderSelfDescribe : form.gender,
        practiceLanguages: form.practiceLanguages.join(","),
      };
      const response = await submitCounselorApplication(payload, documents);
      setSubmitted(response);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="centered-page">
        <div className="card auth-card">
          <h1>Request submitted</h1>
          <p>
            Your counselor access request has been submitted with status{" "}
            <strong>{submitted.status}</strong>. An administrator will review your
            information and supporting documents. You&apos;ll be able to log in once
            approved.
          </p>
          <Link to="/login" className="btn-primary">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page prose-page">
      <h1>Request Counselor Access</h1>
      <p className="muted">
        Counselor accounts are approved by an administrator, not granted automatically.
        Only your name, email, password and country of practice are required — the rest
        helps whoever reviews this decide, and appears on your profile afterwards.
      </p>

      <ol className="step-rail">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={
              i === stepIndex ? "step-item current" : i < stepIndex ? "step-item done" : "step-item"
            }
          >
            <span className="step-index">{i + 1}</span>
            <span className="step-label">{s.label}</span>
          </li>
        ))}
      </ol>

      <form className="card" onSubmit={stepIndex === STEPS.length - 1 ? handleSubmit : goNext}>
        {step === "account" && (
          <>
            <h2>Your account</h2>

            <label className="field-label" htmlFor="fullName">Full name *</label>
            <input id="fullName" type="text" autoComplete="name" value={form.fullName}
                   onChange={(e) => updateField("fullName", e.target.value)} required />

            <label className="field-label" htmlFor="email">Email *</label>
            <input id="email" type="email" autoComplete="email" value={form.email}
                   onChange={(e) => updateField("email", e.target.value)} required />
            <p className="hint">You will sign in with this address once approved.</p>

            <label className="field-label" htmlFor="password">Choose a password *</label>
            <PasswordInput id="password" autoComplete="new-password" autoComplete="new-password" minLength={8}
                   value={form.password} onChange={(e) => updateField("password", e.target.value)} required />
            <p className="hint">At least 8 characters.</p>
          </>
        )}

        {step === "professional" && (
          <>
            <h2>Professional details</h2>
            <p className="muted">
              This is what an administrator reads when deciding on your application,
              and what identifies you on reports you sign off.
            </p>

            <label className="field-label" htmlFor="professionalRole">Professional role</label>
            <input id="professionalRole" type="text" placeholder="e.g. Licensed Clinical Psychologist"
                   value={form.professionalRole} onChange={(e) => updateField("professionalRole", e.target.value)} />

            <label className="field-label" htmlFor="qualification">Highest relevant qualification</label>
            <input id="qualification" type="text" placeholder="e.g. M.A. Clinical Psychology"
                   value={form.qualification} onChange={(e) => updateField("qualification", e.target.value)} />

            <label className="field-label" htmlFor="organization">Organization / practice</label>
            <input id="organization" type="text" placeholder="e.g. Sahyadri Counselling Centre"
                   value={form.organization} onChange={(e) => updateField("organization", e.target.value)} />

            <div className="field-row">
              <div>
                <label className="field-label" htmlFor="licenceAuthority">Licensing / registration body</label>
                <input id="licenceAuthority" type="text" value={form.licenceAuthority}
                       onChange={(e) => updateField("licenceAuthority", e.target.value)} />
                <p className="hint">
                  {LICENCE_HINTS[form.countryCode] ||
                    "The body you are registered with, however it is named where you practise."}
                </p>
              </div>
              <div>
                <label className="field-label" htmlFor="registrationNumber">Registration number</label>
                <input id="registrationNumber" type="text" value={form.registrationNumber}
                       onChange={(e) => updateField("registrationNumber", e.target.value)} />
              </div>
            </div>

            <div className="field-row">
              <div>
                <label className="field-label" htmlFor="licenceExpiresOn">Licence valid until</label>
                <input id="licenceExpiresOn" type="date" value={form.licenceExpiresOn}
                       onChange={(e) => updateField("licenceExpiresOn", e.target.value)} />
                <p className="hint">Used to schedule your next credential review.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="yearsOfExperience">Years in practice</label>
                <input id="yearsOfExperience" type="number" min="0" max="80" value={form.yearsOfExperience}
                       onChange={(e) => updateField("yearsOfExperience", e.target.value)} />
              </div>
            </div>

            <label className="field-label">Languages you counsel in</label>
            <p className="hint">
              Shown on your profile. Separate from which languages this platform can
              analyse — that depends on which models are installed.
            </p>
            <div className="chip-choices">
              {languages.map((l) => (
                <label
                  key={l.code}
                  className={form.practiceLanguages.includes(l.code) ? "chip-choice selected" : "chip-choice"}
                >
                  <input type="checkbox" checked={form.practiceLanguages.includes(l.code)}
                         onChange={() => toggleLanguage(l.code)} />
                  {l.name}
                </label>
              ))}
            </div>

            <label className="field-label" htmlFor="professionalWebsite">Professional website or profile</label>
            <input id="professionalWebsite" type="url" placeholder="https://" value={form.professionalWebsite}
                   onChange={(e) => updateField("professionalWebsite", e.target.value)} />

            <label className="field-label" htmlFor="experience">Relevant experience</label>
            <textarea id="experience" rows={4} value={form.experience}
                      onChange={(e) => updateField("experience", e.target.value)} />
          </>
        )}

        {step === "contact" && (
          <>
            <h2>Contact &amp; location</h2>

            <label className="field-label" htmlFor="countryCode">Country of practice *</label>
            <CountrySelect id="countryCode" value={form.countryCode}
                           onChange={(v) => updateField("countryCode", v)} required />
            <p className="hint">
              This decides which licensing body is expected, which crisis resources are
              shown, and which privacy rules apply to your participants&apos; data.
            </p>

            <label className="field-label" htmlFor="phone-number">Phone number</label>
            <PhoneField idPrefix="phone" dialCode={form.phoneDialCode} nationalNumber={form.phoneNational}
                        countryCode={form.countryCode}
                        onDialCodeChange={(v) => updateField("phoneDialCode", v)}
                        onNationalNumberChange={(v) => updateField("phoneNational", v)} />
            <p className="hint">Without the leading zero.</p>

            <label className="field-label" htmlFor="addressLine1">Practice address</label>
            <input id="addressLine1" type="text" placeholder="Street address" autoComplete="address-line1"
                   value={form.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} />
            <input id="addressLine2" type="text" placeholder="Building, floor, unit (optional)"
                   autoComplete="address-line2" value={form.addressLine2}
                   onChange={(e) => updateField("addressLine2", e.target.value)} />

            <div className="field-row">
              <div>
                <label className="field-label" htmlFor="city">City</label>
                <input id="city" type="text" autoComplete="address-level2" value={form.city}
                       onChange={(e) => updateField("city", e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="stateRegion">State / province / region</label>
                <input id="stateRegion" type="text" autoComplete="address-level1" value={form.stateRegion}
                       onChange={(e) => updateField("stateRegion", e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="postalCode">Postal code</label>
                <input id="postalCode" type="text" autoComplete="postal-code" value={form.postalCode}
                       onChange={(e) => updateField("postalCode", e.target.value)} />
              </div>
            </div>

            <label className="field-label" htmlFor="timezone">Time zone</label>
            {TIMEZONES.length > 0 ? (
              <select id="timezone" value={form.timezone}
                      onChange={(e) => updateField("timezone", e.target.value)}>
                <option value="">Select a time zone</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            ) : (
              <input id="timezone" type="text" placeholder="Asia/Kolkata" value={form.timezone}
                     onChange={(e) => updateField("timezone", e.target.value)} />
            )}
            <p className="hint">Report and session timestamps are shown in this zone.</p>

            <h3>Personal details</h3>
            <p className="hint">
              Both optional, and neither affects whether your application is approved.
              Gender is collected because some participants ask to see a counselor of a
              particular gender.
            </p>

            <div className="field-row">
              <div>
                <label className="field-label" htmlFor="gender">Gender</label>
                <select id="gender" value={form.gender} onChange={(e) => updateField("gender", e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {form.gender === "Prefer to self-describe" && (
                  <input type="text" placeholder="How you describe yourself" value={genderSelfDescribe}
                         onChange={(e) => setGenderSelfDescribe(e.target.value)} />
                )}
              </div>
              <div>
                <label className="field-label" htmlFor="dateOfBirth">Date of birth</label>
                <input id="dateOfBirth" type="date" value={form.dateOfBirth}
                       onChange={(e) => updateField("dateOfBirth", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === "documents" && (
          <>
            <h2>Supporting documents</h2>
            <p className="muted">
              Label each file with what it proves. An administrator reviewing a folder of
              unlabelled scans cannot tell a current licence from one that lapsed in 2019 —
              which is the difference this step exists to make visible.
            </p>

            {documents.length === 0 && (
              <p className="muted">No documents attached yet.</p>
            )}

            {documents.map((doc, index) => (
              <div className="doc-row" key={index}>
                <div className="doc-row-head">
                  <strong>Document {index + 1}</strong>
                  <button type="button" className="btn-link" onClick={() => removeDocument(index)}>
                    Remove
                  </button>
                </div>

                <label className="field-label" htmlFor={`doc-type-${index}`}>What is it?</label>
                <select id={`doc-type-${index}`} value={doc.docType}
                        onChange={(e) => updateDocument(index, { docType: e.target.value })}>
                  {documentTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                <label className="field-label" htmlFor={`doc-file-${index}`}>File</label>
                <input id={`doc-file-${index}`} type="file"
                       onChange={(e) => updateDocument(index, { file: e.target.files?.[0] ?? null })} />

                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor={`doc-auth-${index}`}>Issued by</label>
                    <input id={`doc-auth-${index}`} type="text" value={doc.issuingAuthority}
                           onChange={(e) => updateDocument(index, { issuingAuthority: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`doc-num-${index}`}>Document number</label>
                    <input id={`doc-num-${index}`} type="text" value={doc.documentNumber}
                           onChange={(e) => updateDocument(index, { documentNumber: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`doc-exp-${index}`}>Valid until</label>
                    <input id={`doc-exp-${index}`} type="date" value={doc.expiresOn}
                           onChange={(e) => updateDocument(index, { expiresOn: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}

            <button type="button" className="btn-secondary" onClick={addDocumentRow}>
              + Add a document
            </button>

            <div className="alert alert-warning">
              Uploading a document does not by itself confirm your qualification. An
              administrator verifies it and makes the final decision, and may contact you
              or your licensing body.
            </div>

            <label className="field-label" htmlFor="additionalInfo">Anything else we should know</label>
            <textarea id="additionalInfo" rows={4} value={form.additionalInfo}
                      onChange={(e) => updateField("additionalInfo", e.target.value)} />
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="action-row">
          {stepIndex > 0 && (
            <button type="button" className="btn-secondary" onClick={goBack}>
              Back
            </button>
          )}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {stepIndex === STEPS.length - 1
              ? submitting
                ? "Submitting..."
                : "Submit request"
              : `Next: ${STEPS[stepIndex + 1].label}`}
          </button>
        </div>

        <p className="hint">
          Already approved? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
