import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  cancelEmailChange,
  getSettings,
  requestEmailChange,
  unlinkGoogle,
  updateNotifications,
} from "../api/settings";
import { getVoiceprintStatus } from "../api/voiceprint";
import PasswordInput from "../components/PasswordInput";
import { LoadingState } from "../components/states";

/**
 * The counsellor's settings, as sections down a sub-nav.
 *
 * The active section lives in the URL (?section=security) rather than in
 * component state, so browser Back moves between sections the way a person
 * expects, a section can be linked to, and a refresh does not silently return
 * them to the first tab.
 */
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "email", label: "Email address" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "voice", label: "My voice" },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const requested = params.get("section");
  const section = SECTIONS.some((s) => s.id === requested) ? requested : "profile";

  const [settings, setSettings] = useState(null);
  const [voice, setVoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSettings(), getVoiceprintStatus().catch(() => null)])
      .then(([s, v]) => {
        if (cancelled) return;
        setSettings(s);
        setVoice(v);
      })
      .catch(() => !cancelled && setError("Could not load your settings."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(id) {
    // replace: false so each section is a history entry and Back works.
    setParams({ section: id });
    setNotice("");
    setError("");
  }

  if (loading) {
    return <div className="page"><LoadingState variant="panel" rows={3} label="Loading settings" /></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Manage your account and preferences.</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "settings-nav-item active" : "settings-nav-item"}
              onClick={() => choose(s.id)}
              aria-current={section === s.id ? "page" : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}

          {section === "profile" && (
            <ProfileSection user={user} onGoToFull={() => navigate("/profile")} />
          )}
          {section === "email" && (
            <EmailSection
              settings={settings}
              setSettings={setSettings}
              setNotice={setNotice}
              setError={setError}
            />
          )}
          {section === "security" && (
            <SecuritySection
              settings={settings}
              setSettings={setSettings}
              setNotice={setNotice}
              setError={setError}
              onLogout={() => {
                logout();
                navigate("/login");
              }}
              onChangePassword={() => navigate("/profile")}
            />
          )}
          {section === "notifications" && (
            <NotificationsSection
              settings={settings}
              setSettings={setSettings}
              setNotice={setNotice}
              setError={setError}
            />
          )}
          {section === "voice" && (
            <VoiceSection voice={voice} onEnroll={() => navigate("/voice-enrollment")} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, onGoToFull }) {
  return (
    <div className="card">
      <h2>Profile</h2>
      <dl className="detail-list">
        <div><dt>Name</dt><dd>{user?.name}</dd></div>
        <div><dt>Username</dt><dd>{user?.username || <span className="muted">Not set</span>}</dd></div>
        <div><dt>Role</dt><dd>{user?.role === "ADMIN" ? "Administrator" : "Counsellor"}</dd></div>
      </dl>
      <p className="muted">
        Your professional details — qualification, licence, practice address — are part
        of your verified record and are shown on your account page.
      </p>
      <button className="btn-secondary" onClick={onGoToFull}>
        Open account details
      </button>
    </div>
  );
}

function EmailSection({ settings, setSettings, setNotice, setError }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      setSettings(await requestEmailChange(newEmail, password));
      setNewEmail("");
      setPassword("");
      setNotice(
        "Confirmation sent. Your address changes only once you open the link in that inbox."
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not start the email change.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setError("");
    try {
      setSettings(await cancelEmailChange());
      setNotice("Email change cancelled.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not cancel.");
    }
  }

  return (
    <>
      <div className="card">
        <h2>Email address</h2>
        <dl className="detail-list">
          <div>
            <dt>Current</dt>
            <dd>
              {settings.email}{" "}
              {settings.emailVerified ? (
                <span className="tag-active">Verified</span>
              ) : (
                <span className="tag-warning">Unverified</span>
              )}
            </dd>
          </div>
        </dl>

        {settings.pendingEmail && (
          <div className="alert alert-warning">
            <strong>Waiting for confirmation:</strong> {settings.pendingEmail}
            <p className="muted">
              Your address stays as {settings.email} until the link in that inbox is
              opened. Nothing about your account has changed yet.
            </p>
            <button className="btn-link" onClick={cancel}>Cancel this change</button>
          </div>
        )}
      </div>

      <form className="card" onSubmit={submit}>
        <h2>Change your email</h2>
        <p className="muted">
          Your email address is how you sign in and how you recover your password, so
          the change only takes effect after the new inbox confirms it.
        </p>

        <label className="field-label" htmlFor="newEmail">New email address</label>
        <input
          id="newEmail"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
        />

        <label className="field-label" htmlFor="emailPassword">Your current password</label>
        <PasswordInput
          id="emailPassword"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <p className="hint">
          Asked for because changing this address changes how the account can be
          recovered.
        </p>

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send confirmation"}
        </button>
      </form>
    </>
  );
}

function SecuritySection({ settings, setSettings, setNotice, setError, onLogout, onChangePassword }) {
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setError("");
    setBusy(true);
    try {
      setSettings(await unlinkGoogle());
      setNotice("Google sign-in disconnected. You can still sign in with your password.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not disconnect Google.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Password</h2>
        <p className="muted">
          Choose a new password, or check when it was last changed.
        </p>
        <button className="btn-secondary" onClick={onChangePassword}>
          Change password
        </button>
      </div>

      <div className="card">
        <h2>Google sign-in</h2>
        {!settings.googleAvailable ? (
          <p className="muted">
            Google sign-in is not configured on this deployment, so there is nothing to
            connect. Ask your administrator if you would like it enabled.
          </p>
        ) : settings.googleLinked ? (
          <>
            <p>
              This account can sign in with Google
              {settings.googleLinkedAt && (
                <> — connected {new Date(settings.googleLinkedAt).toLocaleDateString()}</>
              )}
              .
            </p>
            <p className="muted">
              Disconnecting does not delete anything. You will sign in with your email
              and password instead.
            </p>
            <button className="btn-secondary" onClick={disconnect} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect Google"}
            </button>
          </>
        ) : (
          <p className="muted">
            Not connected. Sign in once with the Google button on the sign-in page and
            this account will be linked — Google can only be used to sign in to an
            account an administrator already approved.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Sign out</h2>
        <p className="muted">
          Ends this session on this device. Anything uploaded keeps processing.
        </p>
        <button className="btn-secondary" onClick={onLogout}>Log out</button>
      </div>
    </>
  );
}

const NOTIFICATION_ITEMS = [
  { key: "analysisComplete", label: "Analysis completed",
    hint: "A session has finished processing and its report is ready." },
  { key: "analysisFailed", label: "Analysis failed",
    hint: "A session could not be processed and needs your attention." },
  { key: "needsReview", label: "Session awaiting your assessment",
    hint: "A report is waiting for your professional judgment." },
  { key: "assessmentDiffers", label: "Your assessment differs from the model",
    hint: "You disagreed with the screening result. These are the most useful sessions for improving the models." },
  { key: "reportGenerated", label: "Report generated",
    hint: "Fires for every single session. Off by default, because it tends to drown out the notices above." },
];

function NotificationsSection({ settings, setSettings, setNotice, setError }) {
  const [prefs, setPrefs] = useState(settings.notifications);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      const updated = await updateNotifications(prefs);
      setSettings(updated);
      setPrefs(updated.notifications);
      setNotice("Notification preferences saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your preferences.");
    } finally {
      setBusy(false);
    }
  }

  const dirty = NOTIFICATION_ITEMS.some(
    (item) => prefs[item.key] !== settings.notifications[item.key]
  );

  return (
    <div className="card">
      <h2>Notifications</h2>
      <p className="muted">
        Notifications are delivered by email. They are sent only about your own
        sessions.
      </p>

      {NOTIFICATION_ITEMS.map((item) => (
        <div className="checkbox-row" key={item.key}>
          <input
            id={`notify-${item.key}`}
            type="checkbox"
            checked={Boolean(prefs[item.key])}
            onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
          />
          <label htmlFor={`notify-${item.key}`}>
            {item.label}
            <span className="muted small"> — {item.hint}</span>
          </label>
        </div>
      ))}

      <div className="action-row">
        <button className="btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
        {!dirty && <span className="muted">No changes to save.</span>}
      </div>
    </div>
  );
}

function VoiceSection({ voice, onEnroll }) {
  return (
    <div className="card">
      <h2>Your voice recording</h2>
      <p className="muted">
        Used to tell your voice apart from the participant&apos;s, so only their speech
        is analysed. It is never scored, and the recording itself is deleted once the
        voice profile is made.
      </p>

      {voice?.enrolled ? (
        <dl className="detail-list">
          <div>
            <dt>Status</dt>
            <dd>
              {voice.valid
                ? <span className="tag-active">Active</span>
                : <span className="tag-warning">Expired</span>}
            </dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{new Date(voice.enrolledAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              {new Date(voice.expiresAt).toLocaleDateString()}
              {voice.daysRemaining !== null && voice.daysRemaining >= 0 && (
                <span className="muted"> — {voice.daysRemaining} days left</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="alert alert-warning">
          You have not recorded your voice yet. You cannot start a session until you do.
        </div>
      )}

      <button className="btn-primary" onClick={onEnroll}>
        {voice?.enrolled ? "Record again" : "Record my voice"}
      </button>
    </div>
  );
}
