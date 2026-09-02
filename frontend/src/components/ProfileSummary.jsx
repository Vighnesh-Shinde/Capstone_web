/**
 * A counselor's professional record, read-only.
 *
 * Used on the application review screen and anywhere else an admin needs to
 * see who somebody is. Fields with no value are omitted rather than rendered
 * as a dash: on a record with twenty-odd optional fields, a wall of dashes
 * buries the four things that were actually filled in.
 *
 * The exception is the licence block, which is always shown even when empty —
 * "no licensing body given" is a finding, not a blank, and it is exactly what
 * an administrator is deciding on.
 */
function Field({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="detail-item">
      <span className="field-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function formatAddress(p) {
  const parts = [p.addressLine1, p.addressLine2, p.city, p.stateRegion, p.postalCode]
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function formatAge(dateOfBirth) {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return `${dob.toLocaleDateString()} (age ${age})`;
}

export default function ProfileSummary({ profile, countries = [] }) {
  if (!profile) return null;

  const country = countries.find((c) => c.code === profile.countryCode);
  const countryLabel = country ? `${country.flag} ${country.name}` : profile.countryCode;

  const phone =
    profile.phoneE164 ||
    (profile.phoneDialCode && profile.phoneNational
      ? `${profile.phoneDialCode} ${profile.phoneNational}`
      : "");

  return (
    <>
      <div className="detail-grid">
        <Field label="Country of practice">{countryLabel}</Field>
        <Field label="Phone">{phone}</Field>
        <Field label="Address">{formatAddress(profile)}</Field>
        <Field label="Time zone">{profile.timezone}</Field>
        <Field label="Organization">{profile.organization}</Field>
        <Field label="Professional role">{profile.professionalRole}</Field>
        <Field label="Qualification">{profile.qualification}</Field>
        <Field label="Years in practice">
          {profile.yearsOfExperience === null || profile.yearsOfExperience === undefined
            ? ""
            : String(profile.yearsOfExperience)}
        </Field>
        <Field label="Counsels in">
          {profile.practiceLanguages?.length ? profile.practiceLanguages.join(", ") : ""}
        </Field>
        <Field label="Website">
          {profile.professionalWebsite ? (
            // noreferrer as well as noopener: this URL was supplied by the
            // applicant, and an admin's referrer shouldn't leak to it.
            <a href={profile.professionalWebsite} target="_blank" rel="noopener noreferrer">
              {profile.professionalWebsite}
            </a>
          ) : (
            ""
          )}
        </Field>
        <Field label="Gender">{profile.gender}</Field>
        <Field label="Date of birth">{formatAge(profile.dateOfBirth)}</Field>
      </div>

      <div className="licence-block">
        <h3>Licence</h3>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field-label">Issuing body</span>
            <span>{profile.licenceAuthority || <em className="muted">Not provided</em>}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Registration number</span>
            <span>{profile.registrationNumber || <em className="muted">Not provided</em>}</span>
          </div>
          <div className="detail-item">
            <span className="field-label">Valid until</span>
            <span>
              {profile.licenceExpiresOn
                ? new Date(profile.licenceExpiresOn).toLocaleDateString()
                : <em className="muted">Not provided</em>}
              {profile.licenceExpired && (
                <span className="result-tag elevated">
                  <span className="result-dot" aria-hidden="true" />
                  Expired
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
