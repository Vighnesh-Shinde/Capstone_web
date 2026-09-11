"""
Loads the trained model bundles: text, audio and fusion (required) and
video (optional).

Which file backs each modality is resolved from models/active_manifest.json,
written by the backend when an admin activates a model version. That indirection
is what makes retraining deployable: upload new weights, activate them, and the
service switches over without a code change or a redeploy. If the manifest is
absent (a fresh install, or before any admin upload), the original filenames
shipped with the project are used, so nothing breaks by default.

The manifest is keyed by LANGUAGE first, then modality:

    {"en": {"text": "...", "audio": "...", "fusion": "..."},
     "mr": {"text": "...", "audio": "...", "fusion": "..."}}

so a Marathi model set is installed by exactly the same upload-and-activate
flow as replacing the English one, and a language becomes scorable the moment
its three required files — text, audio, fusion — are present. Earlier deployments wrote a flat
{"text": ...} manifest with no language level; that shape is still read and
treated as English, so an existing install keeps working across the upgrade.

Video is optional and is loaded only when a video model has been activated.
It enters a prediction only if the active fusion model takes three inputs,
[p_text, p_audio, p_video] — the fusion model's input width selects the path;
see FUSION_INPUT_WIDTHS. No video model ships with the project, because the
research project found that adding video made the fused result worse; that is
now something to re-test on evidence rather than a fixed rule. model5 (the
MentalBERT alternative) is still not loaded.

    SECURITY — joblib.load() unpickles, and unpickling executes arbitrary code.
    A malicious .joblib is remote code execution against this service. Only ever
    load files from a trusted source. The upload path is restricted to
    authenticated ADMIN users and the internal endpoints require a shared
    secret, but that is access control, not sandboxing: an admin account is
    fully trusted by design. Never expose model upload to a wider audience.
"""

import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib

logger = logging.getLogger("ml-service")

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
MANIFEST_PATH = MODELS_DIR / "active_manifest.json"

MODALITIES = ("text", "audio", "fusion")

# Used when no manifest exists yet — the files the project shipped with. These
# are English models; no other language ships with weights.
DEFAULT_FILENAMES = {
    "text": "text_honest.joblib",
    "audio": "audio_covarep.joblib",
    "fusion": "fusion_text_audio.joblib",
}

DEFAULT_LANGUAGE = "en"

# What each modality's feature vector must be. A model whose input width
# doesn't match would still load and still return a probability — it would just
# be a meaningless one. Checked at upload time so that never reaches production.
EXPECTED_FEATURE_COUNTS = {
    "text": 3096,
    "audio": 85,
    "fusion": 2,
    # The width of app/real/video_features.py's output (MediaPipe face
    # geometry). Optional, and deliberately NOT in DEFAULT_FILENAMES: no video
    # model ships with the project, and a language must stay scorable without
    # one. It only enters the prediction when the fusion model takes three
    # inputs — see FUSION_INPUT_WIDTHS.
    "video": 111,
}

# The fusion model's own input width decides which modalities it combines, and
# in what order. Nothing else selects the path: uploading a video model changes
# no prediction until a three-input fusion model is activated alongside it.
#
# The ORDER is part of the contract. A fusion model trained on
# [p_text, p_audio, p_video] and fed [p_audio, p_text, p_video] still returns a
# confident probability — just a wrong one — and nothing downstream can detect
# the swap. Training code must emit columns in exactly this order.
FUSION_INPUT_WIDTHS = {
    2: ("text", "audio"),
    3: ("text", "audio", "video"),
}

# Stages that may be installed but are not required for a language to score.
OPTIONAL_MODALITIES = ("video",)


@dataclass
class ModelBundle:
    model: Any
    threshold: float
    cols: list[str] | None
    class_names: list[str] | None
    raw: dict
    source_file: str


def read_manifest() -> dict[str, dict[str, str]]:
    """
    Active filename per modality, per language, over the shipped defaults.

    Accepts both the current nested shape and the legacy flat one written
    before languages existed; a flat manifest is read as English so an
    in-place upgrade does not orphan an admin's already-activated models.
    """
    manifest: dict[str, dict[str, str]] = {DEFAULT_LANGUAGE: dict(DEFAULT_FILENAMES)}

    if not MANIFEST_PATH.exists():
        return manifest

    try:
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        # A corrupt manifest must not take the service down — fall back to the
        # defaults and make the problem loud instead.
        logger.error("Could not read %s (%s); using default model files.", MANIFEST_PATH, e)
        return manifest

    if not isinstance(raw, dict):
        logger.error("%s is not a JSON object; using default model files.", MANIFEST_PATH)
        return manifest

    for key, value in raw.items():
        if isinstance(value, str) and key in MODALITIES:
            manifest[DEFAULT_LANGUAGE][key] = value          # legacy flat entry
        elif isinstance(value, dict):
            language = manifest.setdefault(key, {})
            language.update({m: f for m, f in value.items() if isinstance(f, str)})
        else:
            logger.warning("Ignoring unrecognised manifest entry %r.", key)

    return manifest


def installed_files(language: str) -> dict[str, str]:
    """Filenames the manifest claims for one language (may not exist on disk)."""
    return dict(read_manifest().get(language, {}))


def scoring_languages() -> set[str]:
    """
    Languages whose full model set is present on disk.

    Presence is checked against the filesystem rather than trusting the
    manifest, because "activated" and "actually installed" can drift — a file
    can be removed underneath us, and a language that advertises itself as
    scorable but then fails mid-session is worse than one that never offered.
    """
    return {
        language
        for language, files in read_manifest().items()
        if all(m in files and (MODELS_DIR / files[m]).exists() for m in MODALITIES)
    }


def feature_count(model: Any) -> int | None:
    """
    Input width of a fitted scikit-learn estimator.

    Uses n_features_in_ rather than len(bundle["cols"]) because the fusion model
    has no "cols" key at all — it takes two raw probabilities.
    """
    n = getattr(model, "n_features_in_", None)
    return int(n) if n is not None else None


def fusion_input_modalities(bundle: "ModelBundle") -> tuple[str, ...]:
    """Which probabilities a fusion model expects, in the order it expects them."""
    width = feature_count(bundle.model)
    if width not in FUSION_INPUT_WIDTHS:
        raise ValueError(
            f"The fusion model takes {width} inputs; this platform supports "
            f"{' or '.join(str(w) for w in sorted(FUSION_INPUT_WIDTHS))}."
        )
    return FUSION_INPUT_WIDTHS[width]


def _video_installed(language: str) -> bool:
    filename = installed_files(language).get("video")
    return filename is not None and (MODELS_DIR / filename).exists()


def inspect_bundle(path: Path) -> dict:
    """
    Load a .joblib and describe it, without registering it as active.

    Used by the backend's upload validation. Raises on anything unloadable so
    the caller can reject the file with a real reason.
    """
    bundle = joblib.load(path)

    if not isinstance(bundle, dict):
        raise ValueError(
            f"Expected a dict bundle with 'model' and 'threshold' keys, got {type(bundle).__name__}."
        )
    if "model" not in bundle:
        raise ValueError("Bundle has no 'model' key.")

    model = bundle["model"]
    if not hasattr(model, "predict_proba"):
        raise ValueError(
            f"{type(model).__name__} has no predict_proba(); this pipeline needs probability output."
        )

    return {
        "feature_count": feature_count(model),
        "threshold": bundle.get("threshold"),
        "has_cols": "cols" in bundle,
        "n_cols": len(bundle["cols"]) if bundle.get("cols") else None,
        "class_names": bundle.get("class_names"),
        "model_repr": repr(model)[:2000],
    }


def _load(language: str, modality: str) -> ModelBundle:
    files = read_manifest().get(language, {})
    filename = files.get(modality)
    if filename is None:
        raise FileNotFoundError(
            f"No {modality} model is registered for language '{language}'. "
            f"An administrator must upload and activate one."
        )

    path = MODELS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Model file not found: {path}. Expected the active {language}/{modality} model — "
            f"check models/active_manifest.json, or see README 'Real model integration'."
        )

    bundle = joblib.load(path)
    logger.info("Loaded %s/%s model from %s", language, modality, filename)
    return ModelBundle(
        model=bundle["model"],
        threshold=bundle["threshold"],
        cols=bundle.get("cols"),
        class_names=bundle.get("class_names"),
        raw=bundle,
        source_file=filename,
    )


class Models:
    """Lazily loaded singletons — loaded once, reused across requests."""

    _lock = threading.Lock()
    _cache: dict[tuple[str, str], ModelBundle] = {}

    @classmethod
    def _get(cls, language: str, modality: str) -> ModelBundle:
        key = (language, modality)
        if key not in cls._cache:
            with cls._lock:
                if key not in cls._cache:
                    cls._cache[key] = _load(language, modality)
        return cls._cache[key]

    @classmethod
    def text(cls, language: str = DEFAULT_LANGUAGE) -> ModelBundle:
        return cls._get(language, "text")

    @classmethod
    def audio(cls, language: str = DEFAULT_LANGUAGE) -> ModelBundle:
        return cls._get(language, "audio")

    @classmethod
    def fusion(cls, language: str = DEFAULT_LANGUAGE) -> ModelBundle:
        return cls._get(language, "fusion")

    @classmethod
    def video(cls, language: str = DEFAULT_LANGUAGE) -> ModelBundle:
        return cls._get(language, "video")

    @classmethod
    def preload_all(cls) -> None:
        """
        Call at startup so the first real request isn't slow.

        Only languages that are fully installed are preloaded, and a failure in
        one does not block the others: a half-configured Marathi upload must
        not stop the service from serving English.
        """
        for language in sorted(scoring_languages()):
            modalities = MODALITIES + (("video",) if _video_installed(language) else ())
            for modality in modalities:
                try:
                    cls._get(language, modality)
                except Exception:
                    logger.exception("Could not preload the %s/%s model.", language, modality)

    @classmethod
    def reload(cls) -> dict[str, dict[str, str]]:
        """
        Drop cached models and load whatever the manifest now points at.

        Called by the backend after an admin activates a new version. Swapping
        the cache only after every model has loaded successfully means a bad
        file leaves the previously working models in place rather than taking
        inference down.
        """
        with cls._lock:
            fresh: dict[tuple[str, str], ModelBundle] = {}
            for language in sorted(scoring_languages()):
                for modality in MODALITIES:
                    fresh[(language, modality)] = _load(language, modality)
                if _video_installed(language):
                    fresh[(language, "video")] = _load(language, "video")

                # A three-input fusion with no video model would fail on every
                # session. Refusing here keeps the previously working models in
                # place — the cache is only swapped once everything checks out —
                # instead of letting a half-configured pipeline go live.
                if ("video" in fusion_input_modalities(fresh[(language, "fusion")])
                        and (language, "video") not in fresh):
                    raise ValueError(
                        f"The active {language} fusion model combines text, audio AND "
                        f"video, but no {language} video model is activated. Activate a "
                        f"video model first, or activate a two-input fusion model."
                    )
            cls._cache = fresh

        loaded: dict[str, dict[str, str]] = {}
        for (language, modality), bundle in fresh.items():
            loaded.setdefault(language, {})[modality] = bundle.source_file
        return loaded

    @classmethod
    def active_files(cls) -> dict[str, dict[str, str]]:
        return read_manifest()
