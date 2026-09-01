import { useState } from "react";
import { updateSessionNotes } from "../api/sessions";

const MAX_LENGTH = 4000;

/**
 * The counselor's private working notes for a session.
 *
 * Deliberately distinct from the formal assessment in JudgmentPanel: notes are
 * freely editable and are never used as a dataset label, so nothing written
 * here can accidentally become training ground truth.
 */
export default function SessionNotes({ sessionId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [savedNotes, setSavedNotes] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const dirty = notes !== savedNotes;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateSessionNotes(sessionId, notes);
      setSavedNotes(notes);
      setSavedAt(new Date());
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Your notes</h2>
        {savedAt && !dirty && (
          <span className="muted small">Saved {savedAt.toLocaleTimeString()}</span>
        )}
      </div>
      <p className="muted small">
        Private working notes for your own reference. These are not part of the formal
        assessment and are never used as training data.
      </p>

      <textarea
        className="notes-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={MAX_LENGTH}
        rows={6}
        placeholder="Observations, context, follow-up actions…"
        aria-label="Session notes"
      />

      <div className="toolbar">
        <span className="muted small">
          {notes.length} / {MAX_LENGTH}
        </span>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save notes" : "Saved"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
