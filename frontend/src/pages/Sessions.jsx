import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listSessions } from "../api/sessions";
import StatusBadge from "../components/StatusBadge";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Uploaded", value: "UPLOADED" },
  { label: "Failed", value: "FAILED" },
];

const PAGE_SIZE = 20;

export default function Sessions() {
  // Filters live in the URL so a filtered view can be linked to and survives
  // a refresh — the dashboard's "Awaiting your assessment" tile relies on this.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";
  const page = Number(searchParams.get("page") || 0);
  const sort = searchParams.get("sort") || "createdAt";
  const direction = searchParams.get("direction") || "desc";

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sessionsPage, setSessionsPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    // Any filter change invalidates the current page number.
    if (!("page" in patch)) next.delete("page");
    setSearchParams(next);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSessionsPage(
        await listSessions({ status, search, sort, direction, page, size: PAGE_SIZE })
      );
    } catch {
      setError("Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [status, search, sort, direction, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function toggleSort(field) {
    const nextDirection = sort === field && direction === "desc" ? "asc" : "desc";
    updateParams({ sort: field, direction: nextDirection });
  }

  function sortIndicator(field) {
    if (sort !== field) return null;
    return <span className="sort-arrow">{direction === "asc" ? "▲" : "▼"}</span>;
  }

  const totalPages = sessionsPage?.totalPages ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Sessions</h1>
          <p className="muted">Every interview you&apos;ve uploaded.</p>
        </div>
        <Link to="/sessions/new" className="btn-primary">
          + New session
        </Link>
      </header>

      <div className="toolbar">
        <div className="filter-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              className={status === f.value ? "filter-tab active" : "filter-tab"}
              onClick={() => updateParams({ status: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="Search participant reference…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            updateParams({ search: e.target.value });
          }}
          aria-label="Search sessions"
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && sessionsPage?.content.length === 0 && (
        <div className="card empty-state">
          <p>
            {status || search
              ? "No sessions match these filters."
              : "No sessions yet."}
          </p>
          {(status || search) && (
            <button
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setSearchParams(new URLSearchParams());
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && sessionsPage?.content.length > 0 && (
        <>
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>
                    <button className="th-sort" onClick={() => toggleSort("participantRef")}>
                      Participant {sortIndicator("participantRef")}
                    </button>
                  </th>
                  <th>
                    <button className="th-sort" onClick={() => toggleSort("createdAt")}>
                      Date {sortIndicator("createdAt")}
                    </button>
                  </th>
                  <th>
                    <button className="th-sort" onClick={() => toggleSort("status")}>
                      Status {sortIndicator("status")}
                    </button>
                  </th>
                  <th>Result</th>
                  <th>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessionsPage.content.map((session) => (
                  <tr key={session.id}>
                    <td className="cell-strong">
                      {session.participantId ? (
                        <Link to={`/participants/${session.participantId}`}>
                          {session.participantRef}
                        </Link>
                      ) : (
                        session.participantRef
                      )}
                    </td>
                    <td>{new Date(session.createdAt).toLocaleString()}</td>
                    <td><StatusBadge status={session.status} /></td>
                    <td>
                      {session.prediction
                        ? session.prediction === "depressed"
                          ? "Elevated indicators"
                          : "No elevated indicators"
                        : "—"}
                    </td>
                    <td>
                      {typeof session.confidenceScore === "number"
                        ? `${(session.confidenceScore * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td>
                      <Link to={`/sessions/${session.id}`} className="btn-link">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-secondary"
                disabled={page <= 0}
                onClick={() => updateParams({ page: page - 1 })}
              >
                ← Previous
              </button>
              <span className="muted small">
                Page {page + 1} of {totalPages} · {sessionsPage.totalElements} sessions
              </span>
              <button
                className="btn-secondary"
                disabled={page >= totalPages - 1}
                onClick={() => updateParams({ page: page + 1 })}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
