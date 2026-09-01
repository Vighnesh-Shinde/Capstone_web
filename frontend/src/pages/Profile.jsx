import { useEffect, useState } from "react";
import { changePassword, getProfile, updateProfile } from "../api/profile";
import { useAuth } from "../context/AuthContext";

const MIN_LENGTH = 10;

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function Profile() {
  const { updateCurrentUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProfile();
        if (cancelled) return;
        setProfile(data);
        setName(data.name || "");
        setUsername(data.username || "");
      } catch {
        if (!cancelled) setLoadError("Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    setDetailsError("");
    setDetailsMessage("");
    setSavingDetails(true);
    try {
      const updated = await updateProfile({ name, username: username || null });
      setProfile(updated);
      updateCurrentUser({ name: updated.name, username: updated.username });
      setDetailsMessage("Profile updated.");
    } catch (err) {
      setDetailsError(err.response?.data?.message || "Could not save your changes.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordError("The two new passwords don't match.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMessage("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const refreshed = await getProfile();
      setProfile(refreshed);
    } catch (err) {
      setPasswordError(err.response?.data?.message || "Could not change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <div className="page"><p className="muted">Loading your profile…</p></div>;
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="alert alert-error">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Your account</h1>
          <p className="muted">Update your details and password.</p>
        </div>
        <span className="role-tag">{profile.role}</span>
      </header>

      <div className="grid-two">
        <form className="card" onSubmit={handleDetailsSubmit}>
          <h2>Details</h2>

          <label className="field-label" htmlFor="name">Full name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label className="field-label" htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Optional — you can also sign in with your email"
            pattern="[A-Za-z0-9._\-]*"
            minLength={3}
            maxLength={50}
          />
          <p className="hint">Letters, numbers, dots, underscores and hyphens.</p>

          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" value={profile.email} disabled />
          <p className="hint">
            Your email is the account&apos;s permanent identifier and can&apos;t be changed
            here — ask an administrator if it needs updating.
          </p>

          {detailsError && <div className="alert alert-error">{detailsError}</div>}
          {detailsMessage && <div className="alert alert-success">{detailsMessage}</div>}

          <button className="btn-primary" type="submit" disabled={savingDetails}>
            {savingDetails ? "Saving…" : "Save details"}
          </button>
        </form>

        <div className="stack">
          <form className="card" onSubmit={handlePasswordSubmit}>
            <h2>Change password</h2>

            <label className="field-label" htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />

            <label className="field-label" htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={MIN_LENGTH}
              required
            />
            <p className="hint">At least {MIN_LENGTH} characters.</p>

            <label className="field-label" htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {passwordError && <div className="alert alert-error">{passwordError}</div>}
            {passwordMessage && <div className="alert alert-success">{passwordMessage}</div>}

            <button className="btn-primary" type="submit" disabled={savingPassword}>
              {savingPassword ? "Saving…" : "Change password"}
            </button>
          </form>

          <div className="card">
            <h2>Account activity</h2>
            <dl className="detail-list">
              <div>
                <dt>Role</dt>
                <dd>{profile.role}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{profile.status}</dd>
              </div>
              <div>
                <dt>Account created</dt>
                <dd>{formatDate(profile.createdAt)}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{formatDate(profile.lastLoginAt)}</dd>
              </div>
              <div>
                <dt>Password last changed</dt>
                <dd>{formatDate(profile.passwordChangedAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
