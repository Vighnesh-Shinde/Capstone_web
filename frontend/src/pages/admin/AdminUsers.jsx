import { useCallback, useEffect, useState } from "react";
import {
  issueUserPasswordReset,
  listUsers,
  reactivateUser,
  suspendUser,
} from "../../api/admin";
import StatusBadge from "../../components/StatusBadge";
import { LoadingState } from "../../components/states";

const ROLE_FILTERS = [
  { label: "All", value: null },
  { label: "Counselors", value: "COUNSELOR" },
  { label: "Admins", value: "ADMIN" },
];

export default function AdminUsers() {
  const [role, setRole] = useState(null);
  const [search, setSearch] = useState("");
  const [usersPage, setUsersPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsersPage(await listUsers({ role, search }));
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [role, search]);

  useEffect(() => {
    // Debounced so typing in the search box doesn't fire a request per keystroke.
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function runAction(user, action, successMessage) {
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      await action(user.id);
      setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "That action could not be completed.");
    } finally {
      setBusyId(null);
    }
  }

  function handleSuspend(user) {
    if (
      !window.confirm(
        `Suspend ${user.name}? They will be signed out and unable to log in until reactivated. Their sessions and reports are kept.`
      )
    ) {
      return;
    }
    runAction(user, suspendUser, `${user.name} has been suspended.`);
  }

  function handleReset(user) {
    if (!window.confirm(`Send a password reset link to ${user.email}?`)) return;
    runAction(user, issueUserPasswordReset, `Reset link sent to ${user.email}.`);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Users</h1>
          <p className="muted">
            Everyone with an account. Suspending revokes access without deleting any
            clinical records.
          </p>
        </div>
      </header>

      <div className="toolbar">
        <div className="filter-tabs">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.label}
              className={role === f.value ? "filter-tab active" : "filter-tab"}
              onClick={() => setRole(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="Search name, email or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {loading && <LoadingState variant="table" rows={5} label="Loading users" />}

      {!loading && usersPage?.content.length === 0 && (
        <div className="card empty-state">
          <p>No users match this filter.</p>
        </div>
      )}

      {!loading && usersPage?.content.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Sessions</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usersPage.content.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    <br />
                    <span className="muted">{user.email}</span>
                  </td>
                  <td>{user.username || "—"}</td>
                  <td>
                    <span className="role-tag">{user.role}</span>
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>{user.sessionCount}</td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="row-actions">
                    {user.status === "SUSPENDED" ? (
                      <button
                        className="btn-link"
                        disabled={busyId === user.id}
                        onClick={() =>
                          runAction(user, reactivateUser, `${user.name} has been reactivated.`)
                        }
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        className="btn-link danger"
                        disabled={busyId === user.id}
                        onClick={() => handleSuspend(user)}
                      >
                        Suspend
                      </button>
                    )}
                    <button
                      className="btn-link"
                      disabled={busyId === user.id}
                      onClick={() => handleReset(user)}
                    >
                      Reset password
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
