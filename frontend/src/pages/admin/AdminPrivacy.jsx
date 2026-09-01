import { useCallback, useEffect, useState } from "react";
import { eraseParticipant, runRetentionSweep, searchParticipants } from "../../api/admin";

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function AdminPrivacy() {
  const [search, setSearch] = useState("");
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setParticipants(await searchParticipants(search));
    } catch {
      setError("Failed to load participants.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleSweep() {
    setSweeping(true);
    setError("");
    setNotice("");
    try {
      const { deleted } = await runRetentionSweep();
      setNotice(
        deleted === 0
          ? "Sweep complete — no recordings were past the retention window."
          : `Sweep complete — ${deleted} recording${deleted === 1 ? "" : "s"} deleted. Reports, transcripts and feature vectors are unaffected.`
      );
    } catch {
      setError("Retention sweep failed.");
    } finally {
      setSweeping(false);
    }
  }

  async function handleErase(participant) {
    // Typed confirmation rather than a plain OK/Cancel: this destroys clinical
    // records irreversibly, and a reflexive click should not be enough.
    const typed = window.prompt(
      `This permanently erases EVERYTHING held about "${participant.participantRef}":\n` +
        `  · ${participant.sessionCount} session(s)\n` +
        `  · their recordings, transcripts and feature vectors\n` +
        `  · their reports and the counselor's assessments\n\n` +
        `This cannot be undone. An audit entry recording that the erasure happened will remain.\n\n` +
        `Type the participant reference to confirm:`
    );

    if (typed === null) return;
    if (typed.trim() !== participant.participantRef) {
      setError("Erasure cancelled — the reference you typed did not match.");
      return;
    }

    setBusyId(participant.id);
    setError("");
    setNotice("");
    try {
      const result = await eraseParticipant(participant.id);
      setNotice(`Erased "${participant.participantRef}" — ${result.erased} removed.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Erasure failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Privacy &amp; data</h1>
          <p className="muted">
            Retention and erasure, for acting on a participant&apos;s request.
          </p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <h2>Recording retention</h2>
        <p className="muted">
          Raw recordings are deleted automatically once past the retention window. The
          report, transcript and feature vectors are kept, so retention costs neither the
          clinical record nor the ability to retrain. The sweep runs nightly — this button
          runs it now.
        </p>
        <button className="btn-secondary" onClick={handleSweep} disabled={sweeping}>
          {sweeping ? "Sweeping…" : "Run retention sweep now"}
        </button>
      </div>

      <div className="card danger-zone">
        <h2>Right to erasure</h2>
        <p className="muted">
          Permanently destroys everything held about a participant. Use this only on a
          genuine request from the participant, relayed by their counselor. If they only
          want to stop their data being used for research, withdraw consent on the session
          instead — that keeps the clinical record.
        </p>

        <input
          type="search"
          className="search-input"
          placeholder="Search participant reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search participants"
        />
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && participants.length === 0 && (
        <div className="card empty-state">
          <p>{search ? `No participants match "${search}".` : "No participants recorded yet."}</p>
        </div>
      )}

      {!loading && participants.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Counselor</th>
                <th>Sessions</th>
                <th>First seen</th>
                <th>Last session</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.participantRef}</td>
                  <td>
                    {p.counselorName}
                    <br />
                    <span className="muted small">{p.counselorEmail}</span>
                  </td>
                  <td>{p.sessionCount}</td>
                  <td>{formatDate(p.firstSeenAt)}</td>
                  <td>{formatDate(p.lastSessionAt)}</td>
                  <td>
                    <button
                      className="btn-link danger"
                      disabled={busyId === p.id}
                      onClick={() => handleErase(p)}
                    >
                      {busyId === p.id ? "Erasing…" : "Erase all data"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
