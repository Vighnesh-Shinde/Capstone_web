import { useState } from "react";
import { Link } from "react-router-dom";
import { submitCounselorApplication } from "../api/applications";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  organization: "",
  professionalRole: "",
  qualification: "",
  experience: "",
  registrationNumber: "",
  additionalInfo: "",
};

export default function RequestCounselorAccess() {
  const [form, setForm] = useState(initialForm);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Full name, email, and password are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitCounselorApplication(form, documents);
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
            information and supporting documents. You'll be able to log in once
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
    <div className="page">
      <h1>Request Counselor Access</h1>
      <p className="muted">
        Counselor accounts require administrator approval. Provide your
        professional information and supporting documents below; you'll be
        notified of the decision when you attempt to log in.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="fullName">Full name *</label>
        <input id="fullName" type="text" value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} required />

        <label className="field-label" htmlFor="email">Email *</label>
        <input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />

        <label className="field-label" htmlFor="password">Choose a password *</label>
        <input id="password" type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} required />

        <label className="field-label" htmlFor="phone">Phone / contact information</label>
        <input id="phone" type="text" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />

        <label className="field-label" htmlFor="organization">Organization / institution</label>
        <input id="organization" type="text" value={form.organization} onChange={(e) => updateField("organization", e.target.value)} />

        <label className="field-label" htmlFor="professionalRole">Professional role</label>
        <input id="professionalRole" type="text" placeholder="e.g. Licensed Clinical Psychologist" value={form.professionalRole} onChange={(e) => updateField("professionalRole", e.target.value)} />

        <label className="field-label" htmlFor="qualification">Qualification</label>
        <input id="qualification" type="text" placeholder="e.g. M.A. Clinical Psychology" value={form.qualification} onChange={(e) => updateField("qualification", e.target.value)} />

        <label className="field-label" htmlFor="experience">Relevant experience</label>
        <textarea id="experience" value={form.experience} onChange={(e) => updateField("experience", e.target.value)} />

        <label className="field-label" htmlFor="registrationNumber">Professional registration number (if applicable)</label>
        <input id="registrationNumber" type="text" value={form.registrationNumber} onChange={(e) => updateField("registrationNumber", e.target.value)} />

        <label className="field-label" htmlFor="additionalInfo">Additional information</label>
        <textarea id="additionalInfo" value={form.additionalInfo} onChange={(e) => updateField("additionalInfo", e.target.value)} />

        <label className="field-label" htmlFor="documents">Supporting/verification documents</label>
        <input
          id="documents"
          type="file"
          multiple
          onChange={(e) => setDocuments(Array.from(e.target.files || []))}
        />
        <p className="muted small">
          e.g. qualification certificates, professional registration proof. Uploading
          a document does not by itself confirm your qualification — an administrator
          makes the final decision.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit request"}
        </button>

        <p className="hint">
          Already approved? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
