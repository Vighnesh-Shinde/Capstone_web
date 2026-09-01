"""
Loads the three trained model bundles (text, audio, fusion).

Which file backs each modality is resolved from models/active_manifest.json,
written by the backend when an admin activates a model version. That indirection
is what makes retraining deployable: upload new weights, activate them, and the
service switches over without a code change or a redeploy. If the manifest is
absent (a fresh install, or before any admin upload), the original filenames
shipped with the project are used, so nothing breaks by default.

model3 (video) and model5 (MentalBERT alternative) are deliberately not loaded:
the research project's own testing found including video makes the fused result
WORSE, and model5 is an optional alternative, not part of the recommended path.
See friend_shared_work/README_FIRST.txt section 2.

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

# Used when no manifest exists yet — the files the project shipped with.
DEFAULT_FILENAMES = {
    "text": "text_honest.joblib",
    "audio": "audio_covarep.joblib",
    "fusion": "fusion_text_audio.joblib",
}

# What each modality's feature vector must be. A model whose input width
# doesn't match would still load and still return a probability — it would just
# be a meaningless one. Checked at upload time so that never reaches production.
EXPECTED_FEATURE_COUNTS = {
    "text": 3096,
    "audio": 85,
    "fusion": 2,
}


@dataclass
class ModelBundle:
    model: Any
    threshold: float
    cols: list[str] | None
    class_names: list[str] | None
    raw: dict
    source_file: str


def read_manifest() -> dict[str, str]:
    """Active filename per modality, falling back to the shipped defaults."""
    filenames = dict(DEFAULT_FILENAMES)
    if MANIFEST_PATH.exists():
        try:
            filenames.update(json.loads(MANIFEST_PATH.read_text()))
        except (json.JSONDecodeError, OSError) as e:
            # A corrupt manifest must not take the service down — fall back to
            # the defaults and make the problem loud instead.
            logger.error("Could not read %s (%s); using default model files.", MANIFEST_PATH, e)
    return filenames


def feature_count(model: Any) -> int | None:
    """
    Input width of a fitted scikit-learn estimator.

    Uses n_features_in_ rather than len(bundle["cols"]) because the fusion model
    has no "cols" key at all — it takes two raw probabilities.
    """
    n = getattr(model, "n_features_in_", None)
    return int(n) if n is not None else None


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


def _load(modality: str) -> ModelBundle:
    filename = read_manifest()[modality]
    path = MODELS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Model file not found: {path}. Expected the active {modality} model — check "
            f"models/active_manifest.json, or see README 'Real model integration'."
        )

    bundle = joblib.load(path)
    logger.info("Loaded %s model from %s", modality, filename)
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
    _cache: dict[str, ModelBundle] = {}

    @classmethod
    def _get(cls, modality: str) -> ModelBundle:
        if modality not in cls._cache:
            with cls._lock:
                if modality not in cls._cache:
                    cls._cache[modality] = _load(modality)
        return cls._cache[modality]

    @classmethod
    def text(cls) -> ModelBundle:
        return cls._get("text")

    @classmethod
    def audio(cls) -> ModelBundle:
        return cls._get("audio")

    @classmethod
    def fusion(cls) -> ModelBundle:
        return cls._get("fusion")

    @classmethod
    def preload_all(cls) -> None:
        """Call at startup so the first real request isn't slow."""
        cls.text()
        cls.audio()
        cls.fusion()

    @classmethod
    def reload(cls) -> dict[str, str]:
        """
        Drop cached models and load whatever the manifest now points at.

        Called by the backend after an admin activates a new version. Swapping
        the cache only after every model has loaded successfully means a bad
        file leaves the previously working models in place rather than taking
        inference down.
        """
        with cls._lock:
            fresh = {modality: _load(modality) for modality in DEFAULT_FILENAMES}
            cls._cache = fresh
        return {modality: bundle.source_file for modality, bundle in fresh.items()}

    @classmethod
    def active_files(cls) -> dict[str, str]:
        return read_manifest()
