import { useCallback, useEffect, useState } from "react";
import {
  activateModelVersion,
  listModelVersions,
  revertModelToDefault,
  uploadModelVersion,
} from "../../api/admin";
import { getLanguages } from "../../api/reference";
import useReferenceData from "../../hooks/useReferenceData";
import { LoadingState } from "../../components/states";

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
    value: "VIDEO",
    label: "Video",
    features: 111,
    // A language scores without it; it only changes a prediction when the
    // active fusion model takes three inputs.
    optional: true,
    blurb:
      "Reads facial movement — mouth, eye and brow geometry from MediaPipe Face Mesh. " +
      "Optional: it only affects predictions when the active fusion model takes three inputs.",
  },
  {
    value: "FUSION",
    label: "Fusion",
    features: "2 or 3",
    blurb:
      "Combines the per-stage probabilities into the final score. Two inputs means " +
      "[text, audio]; three means [text, audio, video], in that order. A three-input " +
      "model can only be activated once a video model is active for the same language.",
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

  const { data: allLanguages } = useReferenceData(getLanguages);
  const [modality, setModality] = useState("TEXT");
  // Which language's pipeline this upload belongs to. Defaults to English
  // because replacing the English models is still the common case; picking any
  // other language here is what bootstraps that language into being scorable.
  const [language, setLanguage] = useState("en");
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
      const created = await uploadModelVersion({ modality, language, file, versionLabel, notes });
      setNotice(
        `Uploaded ${created.languageName} ${created.modality} version "${created.versionLabel}" — ` +
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
    const active = versions.find(
      (v) => v.modality === version.modality && v.language === version.language && v.active
    );
    const message = active
      ? `Switch the ${version.modality} model from "${active.versionLabel}" to "${version.versionLabel}"?\n\n` +
        `All new sessions will be analysed with the new weights immediately. Reports already produced are unchanged.`
      : `Activate "${version.versionLabel}" as the ${version.languageName} ${version.modality} model?`;
    const fusion = versions.find(
      (v) => v.modality === "FUSION" && v.language === version.language && v.active
    );
    // Activating video is harmless on its own, which is exactly why it can be
    // confusing: nothing changes until a three-input fusion model is active.
    const videoNote =
      version.modality === "VIDEO" && fusion?.featureCount !== 3
        ? `\n\nThe active fusion model takes two inputs, so video will not affect ` +
          `predictions until a three-input fusion model is activated.`
        : "";

    if (!window.confirm(message + videoNote)) return;

    setBusyId(version.id);
    setError("");
    setNotice("");
    try {
      await activateModelVersion(version.id);
      setNotice(
        `${version.languageName} ${version.modality} is now serving "${version.versionLabel}".`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Activation failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevert(modalityValue, languageCode, activeLabel) {
    const isVideo = modalityValue === "VIDEO";
    const question = isVideo
      ? `Remove the video model "${activeLabel}"?\n\n` +
        `There is no built-in video model, so this simply stops using video. It is ` +
        `refused while the active fusion model takes video as an input.`
      : `Revert ${modalityValue} to the built-in model, replacing "${activeLabel}"?\n\n` +
        `Use this if an uploaded model is misbehaving and there's no earlier version to fall back to.`;
    if (!window.confirm(question)) {
      return;
    }

    // Same key the card uses, so the right button shows as busy.
    setBusyId(`${languageCode}:${modalityValue}`);
    setError("");
    setNotice("");
    try {
      // The language must be passed: without it every revert hit English,
      // whichever language's card the button was on.
      await revertModelToDefault(modalityValue, languageCode);
      setNotice(
        isVideo
          ? `The video model "${activeLabel}" was removed.`
          : `${modalityValue} is back on the built-in model.`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Revert failed.");
    } finally {
      setBusyId(null);
    }
  }

  const selected = MODALITIES.find((m) => m.value === modality);

  // English always appears, because it has built-in weights whether or not
  // anything was ever uploaded. Every other language appears only once it has
  // at least one uploaded version — an admin does not need twenty empty
  // Swahili cards to tell them Swahili has no models.
  const languagesWithUploads = new Set(versions.map((v) => v.language));
  const installedLanguages = allLanguages.filter(
    (l) => l.code === "en" || languagesWithUploads.has(l.code)
  );

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
      {/* One block per language that has anything uploaded, plus English,
          which always exists because it ships with built-in weights. */}
      {installedLanguages.map((lang) => (
        <section key={lang.code} className="model-language-block">
          <h2 className="model-language-heading">
            {lang.name}
            {lang.code === "en" && <span className="tag-active">built-in</span>}
          </h2>

          <div className="stat-row">
            {MODALITIES.map((m) => {
              const active = versions.find(
                (v) => v.modality === m.value && v.language === lang.code && v.active
              );
              const busyKey = `${lang.code}:${m.value}`;
              // Whether video actually reaches predictions is decided by the
              // active fusion model's input width, not by a video model existing.
              const activeFusion = versions.find(
                (v) => v.modality === "FUSION" && v.language === lang.code && v.active
              );
              const fusionUsesVideo = activeFusion?.featureCount === 3;
              let detail;
              if (!active) {
                detail = m.optional
                  ? "Optional — only used by a three-input fusion model"
                  : lang.code === "en"
                    ? "Shipped with the project — no upload yet"
                    : "No model activated for this language";
              } else if (m.value === "VIDEO" && !fusionUsesVideo) {
                detail = "Active, but not used yet — the fusion model takes two inputs";
              } else if (m.value === "FUSION") {
                detail =
                  `${active.featureCount === 3 ? "Uses text, audio and video" : "Uses text and audio"}` +
                  ` · activated ${formatDateTime(active.activatedAt)}`;
              } else {
                detail = `Activated ${formatDateTime(active.activatedAt)}`;
              }
              return (
                <div key={busyKey} className="stat-card">
                  <span className="stat-label">
                    {m.label} · {m.features} features
                    {m.optional && " · optional"}
                  </span>
                  <span className="stat-value model-active-label">
                    {active
                      ? active.versionLabel
                      : lang.code === "en" && !m.optional
                        ? "Built-in default"
                        : "Not installed"}
                  </span>
                  <span className="muted small">{detail}</span>
                  {active && (
                    <button
                      className="btn-link danger revert-link"
                      disabled={busyId === busyKey}
                      onClick={() => handleRevert(m.value, lang.code, active.versionLabel)}
                    >
                      {m.optional ? "Remove" : "Revert to built-in"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* A language is only usable when its three required stages are
              present. Saying so here is what stops an admin uploading one file
              and wondering why sessions still refuse to run. */}
          {lang.code !== "en" && !lang.scoring && (
            <div className="alert alert-warning">
              {lang.name} is not yet available for sessions. Text, audio and fusion all
              need an activated model before counselors can select it; video is optional.
              English models are never substituted in.
            </div>
          )}
        </section>
      ))}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <form className="card" onSubmit={handleUpload}>
        <h2>Upload a new version</h2>

        <label className="field-label" htmlFor="model-language">Language</label>
        <select
          id="model-language"
          className="search-input"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {allLanguages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.scoring ? "" : " — no models yet"}
            </option>
          ))}
        </select>
        <p className="hint">
          Which language pipeline these weights serve. Uploading text, audio and fusion
          for a new language is what makes that language selectable when creating a
          session. Video is optional.
        </p>

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
          with an input width of {selected.features}. Anything else is rejected —
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
      {loading && <LoadingState variant="cards" rows={3} label="Loading models" />}

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
                <th>Language</th>
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
                  <td>{v.languageName}</td>
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
