"""
Loads the three trained model bundles (text, audio, fusion) once at process
startup. Each bundle is exactly what's inside the .joblib files your friend
shared — see friend_shared_work/README_FIRST.txt for how they were trained.

model3 (video) and model5 (MentalBERT alternative) are deliberately not
loaded here: your friend's own testing found including video makes the
fused result WORSE, and model5 is an optional alternative, not part of the
recommended path. See friend_shared_work/README_FIRST.txt section 2.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"


@dataclass
class ModelBundle:
    model: Any
    threshold: float
    cols: list[str] | None
    class_names: list[str] | None
    raw: dict


def _load(filename: str) -> ModelBundle:
    path = MODELS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Model file not found: {path}. Expected the three .joblib files "
            f"copied from friend_shared_work into ml-service/models/ — see README."
        )
    bundle = joblib.load(path)
    return ModelBundle(
        model=bundle["model"],
        threshold=bundle["threshold"],
        cols=bundle.get("cols"),
        class_names=bundle.get("class_names"),
        raw=bundle,
    )


class Models:
    """Lazily loaded singletons — loaded once, reused across requests."""

    _text: ModelBundle | None = None
    _audio: ModelBundle | None = None
    _fusion: ModelBundle | None = None

    @classmethod
    def text(cls) -> ModelBundle:
        if cls._text is None:
            cls._text = _load("text_honest.joblib")
        return cls._text

    @classmethod
    def audio(cls) -> ModelBundle:
        if cls._audio is None:
            cls._audio = _load("audio_covarep.joblib")
        return cls._audio

    @classmethod
    def fusion(cls) -> ModelBundle:
        if cls._fusion is None:
            cls._fusion = _load("fusion_text_audio.joblib")
        return cls._fusion

    @classmethod
    def preload_all(cls) -> None:
        """Call at startup so the first real request isn't slow."""
        cls.text()
        cls.audio()
        cls.fusion()
