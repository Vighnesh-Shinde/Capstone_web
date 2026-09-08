import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useReturnState } from "../hooks/useReturnTo";
import { LoadingState, EmptyState, ErrorState } from "../components/states";
import { IconParticipants, IconSearch } from "../components/StateIcons";
import { listParticipants } from "../api/participants";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function Participants() {
  const returnState = useReturnState();
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listParticipants()
      .then((data) => !cancelled && setParticipants(data))
      .catch(() => !cancelled && setError("Failed to load participants."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // The list is one row per participant for a single counselor, so filtering
  // client-side avoids a round trip per keystroke.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return participants;
    return participants.filter((p) => p.participantRef.toLowerCase().includes(term));
  }, [participants, search]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Participants</h1>
          <p className="muted">
            Everyone you&apos;ve recorded a session for. Open one to see their history over time.
          </p>
        </div>
        <Link to="/sessions/new" className="btn-primary">
          + New session
        </Link>
      </header>

      {participants.length > 0 && (
        <div className="toolbar">
          <input
            type="search"
            className="search-input"
            placeholder="Search participant reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search participants"
          />
          <span className="muted small">
            {filtered.length} of {participants.length}
          </span>
        </div>
      )}

      {error && <ErrorState message={error} />}
      {loading && <LoadingState variant="table" rows={4} label="Loading participants" />}

      {!loading && !error && participants.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<IconParticipants />}
            title="No participants yet"
            action={{ label: "Record your first session", to: "/sessions/new" }}
          >
            A participant is created the first time you upload a session for them. Upload
            a second session under the same reference and it groups with the first.
          </EmptyState>
        </div>
      )}

      {!loading && participants.length > 0 && filtered.length === 0 && (
        <div className="card">
          <EmptyState icon={<IconSearch />} title={`No participants match “${search}”`}>
            Check the reference, or clear the search to see everyone.
          </EmptyState>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Sessions</th>
                <th>First seen</th>
                <th>Last session</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong">{p.participantRef}</td>
                  <td>{p.sessionCount}</td>
                  <td>{formatDate(p.firstSeenAt)}</td>
                  <td>{formatDate(p.lastSessionAt)}</td>
                  <td>
                    <Link to={`/participants/${p.id}`} state={returnState} className="btn-link">
                      View history
                    </Link>
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
