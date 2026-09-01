import { useCallback, useEffect, useState } from "react";
import {
  activateModelVersion,
  listModelVersions,
  revertModelToDefault,
  uploadModelVersion,
} from "../../api/admin";

const MODALITIES = [
  {
    value: "TEXT",
    label: "Text",
    features: 3096,
    blurb: "Reads what the participant said — lexical habits plus sentence meaning vectors.",
  },
  {
    value: "AUDIO",
    label: "Audio",
    features: 85,
    blurb: "Reads how they said it — response latency, pauses, pitch and loudness variation.",
  },
  {
    value: "FUSION",
    label: "Fusion",
    features: 2,
    blurb: "Combines the text and audio probabilities into the final score.",
  },
];

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AdminModels() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modality, setModality] = useState("TEXT");
  const [file, setFile] = useState(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await listModelVersions());
    } catch {
      setError("Failed to load model versions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setNotice("");
    try {
      const created = await uploadModelVersion({ modality, file, versionLabel, notes });
      setNotice(
        `Uploaded ${created.modality} version "${created.versionLabel}" — ` +
          `${created.featureCount} features, threshold ${created.threshold}. ` +
          `It is stored but not yet serving; activate it when you're ready.`
      );
      setFile(null);
      setVersionLabel("");
      setNotes("");
      e.target.reset();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleActivate(version) {
    const active = versions.find((v) => v.modality === version.modality && v.active);
    const message = active
      ? `Switch the ${version.modality} model from "${active.versionLabel}" to "${version.versionLabel}"?\n\n` +
        `All new sessions will be analysed with the new weights immediately. Reports already produced are unchanged.`
      : `Activate "${version.versionLabel}" as the ${version.modality} model?`;

    if (!window.confirm(message)) return;

    setBusyId(version.id);
    setError("");
    setNotice("");
    try {
      await activateModelVersion(version.id);
      setNotice(`${version.modality} is now serving "${version.versionLabel}".`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Activation failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevert(modalityValue, activeLabel) {
    if (
      !window.confirm(
        `Revert ${modalityValue} to the built-in model, replacing "${activeLabel}"?\n\n` +
          `Use this if an uploaded model is misbehaving and there's no earlier version to fall back to.`
      )
    ) {
      return;
    }

    setBusyId(modalityValue);
    setError("");
    setNotice("");
    try {
      await revertModelToDefault(modalityValue);
      setNotice(`${modalityValue} is back on the built-in model.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Revert failed.");
    } finally {
      setBusyId(null);
    }
  }

  const selected = MODALITIES.find((m) => m.value === modality);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Model weights</h1>
          <p className="muted">
            Upload retrained models and switch which version serves predictions.
          </p>
        </div>
      </header>

      <div className="alert alert-warning">
        <strong>Uploading a model runs its code.</strong> A <code>.joblib</code> is a
        Python pickle, and loading one executes whatever it contains inside the analysis
        service. Only upload files you produced yourself or received from someone you
        trust completely.
      </div>

      {/* Current state first: "what is serving right now" is the question an
          operator opens this page to answer. */}
      <div className="stat-row">
        {MODALITIES.map((m) => {
          const active = versions.find((v) => v.modality === m.value && v.active);
          return (
            <div key={m.value} className="stat-card">
              <span className="stat-label">{m.label} · {m.features} features</span>
              <span className="stat-value model-active-label">
                {active ? active.versionLabel : "Built-in default"}
              </span>
              <span className="muted small">
                {active
                  ? `Activated ${formatDateTime(active.activatedAt)}`
                  : "Shipped with the project — no upload yet"}
              </span>
              {active && (
                <button
                  className="btn-link danger revert-link"
                  disabled={busyId === m.value}
                  onClick={() => handleRevert(m.value, active.versionLabel)}
                >
                  Revert to built-in
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <form className="card" onSubmit={handleUpload}>
        <h2>Upload a new version</h2>

        <label className="field-label" htmlFor="modality">Stage</label>
        <select
          id="modality"
          className="search-input"
          value={modality}
          onChange={(e) => setModality(e.target.value)}
        >
          {MODALITIES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} ({m.features} features)
            </option>
          ))}
        </select>
        <p className="hint">{selected.blurb}</p>

        <label className="field-label" htmlFor="file">Model bundle (.joblib)</label>
        <input
          id="file"
          type="file"
          accept=".joblib"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
        <p className="hint">
          Must be a joblib dict containing <code>model</code> and <code>threshold</code>,
          with an input width of exactly {selected.features}. Anything else is rejected —
          a mis-shaped model would still return a number, just a meaningless one.
        </p>

        <label className="field-label" htmlFor="versionLabel">Version label</label>
        <input
          id="versionLabel"
          type="text"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          placeholder="e.g. text-2026-09-retrain (auto-generated if blank)"
          maxLength={100}
        />

        <label className="field-label" htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          className="notes-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Training data, held-out scores, what changed since the last version…"
        />

        <button className="btn-primary" type="submit" disabled={uploading || !file}>
          {uploading ? "Validating…" : "Upload and validate"}
        </button>
      </form>

      <h2>Version history</h2>
      {loading && <p className="muted">Loading…</p>}

      {!loading && versions.length === 0 && (
        <div className="card empty-state">
          <p>No models have been uploaded yet.</p>
          <p className="muted">
            The three models shipped with the project are serving. Uploading a version
            here takes over from them.
          </p>
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Version</th>
                <th>Features</th>
                <th>Threshold</th>
                <th>Uploaded</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className={v.active ? "row-active" : undefined}>
                  <td>{v.modality}</td>
                  <td className="cell-strong">
                    {v.versionLabel}
                    {v.active && <span className="tag-active">serving</span>}
                    {v.notes && <div className="muted small">{v.notes}</div>}
                    <div className="muted small mono">sha256 {v.sha256.slice(0, 16)}…</div>
                  </td>
                  <td>{v.featureCount ?? "—"}</td>
                  <td>{v.threshold ?? "—"}</td>
                  <td>{formatDateTime(v.uploadedAt)}</td>
                  <td>{v.uploadedByName || "—"}</td>
                  <td>
                    {v.active ? (
                      <span className="muted small">Active</span>
                    ) : (
                      <button
                        className="btn-link"
                        disabled={busyId === v.id}
                        onClick={() => handleActivate(v)}
                      >
                        Activate
                      </button>
                    )}
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
