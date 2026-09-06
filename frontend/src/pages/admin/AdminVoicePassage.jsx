import { useEffect, useState } from "react";
import { getPassageHistory, updatePassage } from "../../api/enrollmentPassage";

/**
 * Edit the passage every counsellor and companion reads to enrol a voice.
 *
 * The screen leads with what changing it does and does not do, because the
 * obvious fear — "will this invalidate everyone's voiceprint and lock my
 * clinic out?" — is exactly wrong, and an admin who assumes it is true will
 * never touch the setting even when they should.
 */
export default function AdminVoicePassage() {
  const [history, setHistory] = useState([]);
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await getPassageHistory();
      setHistory(data);
      setBody(data.find((p) => p.active)?.body ?? "");
    } catch {
      setError("Could not load the enrolment passage.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setSaving(true);
    try {
      const updated = await updatePassage(body, notes);
      setSaved(`Saved as ${updated.version}.`);
      setNotes("");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save the passage.");
    } finally {
      setSaving(false);
    }
  }

  const active = history.find((p) => p.active);
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const unchanged = active && active.body === body.replace(/\s+/g, " ").trim();

  if (loading) {
    return <div className="page"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Voice enrolment passage</h1>
          <p className="muted">
            The text counsellors — and anyone accompanying a participant — read aloud so
            the analysis can recognise their voice.
          </p>
        </div>
      </header>

      <div className="card">
        <h2>What changing this does</h2>
        <ul>
          <li>
            <strong>Nobody has to re-record.</strong> A voiceprint describes how a person
            sounds, not what they said, so existing enrolments stay valid.
          </li>
          <li>
            Everyone reads the <strong>same</strong> passage. The recordings are compared
            against each other, so a shared text keeps the comparison about the voice.
          </li>
          <li>
            Old versions are kept. Each voiceprint records which version its owner read.
          </li>
          <li>
            Pick something <strong>neutral</strong>. The reader is a clinician being
            voice-printed, not a participant being assessed — emotionally loaded text
            would be an odd thing to ask them to read.
          </li>
        </ul>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Passage text</h2>

        <label className="field-label" htmlFor="passage">
          Read aloud by everyone enrolling a voice
        </label>
        <textarea
          id="passage"
          rows={9}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <p className="hint">
          {wordCount} words — roughly {Math.max(15, Math.round((wordCount / 150) * 60))}{" "}
          seconds read aloud. At least 40 words are needed: shorter passages do not
          produce enough speech and will fail enrolment for everyone.
        </p>

        <label className="field-label" htmlFor="notes">
          Why are you changing it? <span className="optional-tag">(optional)</span>
        </label>
        <input
          id="notes"
          type="text"
          placeholder="e.g. switched to Marathi for the Pune clinic"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <div className="alert alert-error">{error}</div>}
        {saved && <div className="alert alert-success">{saved}</div>}

        <div className="action-row">
          <button className="btn-primary" type="submit" disabled={saving || unchanged}>
            {saving ? "Saving…" : "Save as new version"}
          </button>
          {unchanged && <span className="muted">No changes to save.</span>}
        </div>
      </form>

      <div className="card table-card">
        <div className="card-header">
          <h2>Version history</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Words</th>
                <th>Created</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.version}</td>
                  <td>{p.wordCount}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>{p.notes || <span className="muted">—</span>}</td>
                  <td>{p.active && <span className="tag-active">Live</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
