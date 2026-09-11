"""
Turning a session's measurements into each model's input — by column NAME.

WHY
---
Until now each model had to take exactly the vector its extractor produced, in
the extractor's order, and the only check was the width. That is how two
different feature sets can be confused without anyone noticing: a video model
trained on 224 OpenFace columns and one trained on 224 of anything else look
identical to a width check, and both return confident numbers.

Every trained bundle carries a "cols" list naming its inputs in order. So the
extractors now produce named features, and each model's input is assembled
from its own list. That gives three things:

- An upload is rejected unless every column it names is something this
  platform actually measures — checked by name, not by count.
- One modality can have more than one feature set. Audio accepts the original
  85-column model and the DAIC-WOZ "clean-64" one; video accepts MediaPipe
  geometry and OpenFace action units. The model's own columns decide.
- A feature that could not be measured reaches the model as missing (NaN), for
  its imputer to fill with the training median — which is what the DAIC-WOZ
  training did — instead of as a zero that looks like a real measurement.
"""

from __future__ import annotations

import numpy as np

from app.real.audio_features import ALL_AUDIO_COLS, AUDIO_COLS
from app.real.openface_features import OPENFACE_COLS
from app.real.text_features import LEX_COLS
from app.real.video_features import VIDEO_COLS

# The text extractor's output: 24 lexical counts, then 3,072 mpnet columns
# pooled as [mean, length-weighted mean, max, std] x 768.
TEXT_COLS = LEX_COLS + [f"mpnet_{i}" for i in range(3072)]

# Every extractor, per modality, and the columns it can produce.
EXTRACTORS: dict[str, dict[str, list[str]]] = {
    "text": {"text": TEXT_COLS},
    "audio": {"audio": ALL_AUDIO_COLS},
    "video": {"mediapipe": VIDEO_COLS, "openface": OPENFACE_COLS},
}
_PRODUCIBLE = {m: {name: set(cols) for name, cols in e.items()} for m, e in EXTRACTORS.items()}

# Assumed input order for a bundle that names no columns. Only accepted when
# its width matches exactly; anything else must say what it expects.
_UNNAMED_LAYOUT = {"text": TEXT_COLS, "audio": AUDIO_COLS, "video": VIDEO_COLS}


def extractor_for(modality: str, cols) -> str | None:
    """Which extractor can supply every one of these columns, if any."""
    wanted = set(cols)
    for name, available in _PRODUCIBLE[modality].items():
        if wanted <= available:
            return name
    return None


def model_columns(modality: str, cols, width: int | None) -> list[str]:
    """
    The input columns a model expects, or ValueError saying why this platform
    cannot feed it.
    """
    if not cols:
        layout = _UNNAMED_LAYOUT[modality]
        if width != len(layout):
            raise ValueError(
                f"This {modality} model does not name its inputs (no 'cols' key), so they "
                f"can only be assumed to be the standard {len(layout)}-column layout — but "
                f"it takes {width}. Re-save the bundle with a 'cols' list naming each input "
                f"in order."
            )
        return list(layout)

    cols = [str(c) for c in cols]
    if width is not None and len(cols) != width:
        raise ValueError(
            f"The bundle names {len(cols)} input columns, but the model takes {width} inputs."
        )
    if len(set(cols)) != len(cols):
        raise ValueError("The bundle's 'cols' list names the same column more than once.")

    if extractor_for(modality, cols) is None:
        # Report against the closest extractor, which is the useful comparison.
        name, missing = min(
            ((n, [c for c in cols if c not in available])
             for n, available in _PRODUCIBLE[modality].items()),
            key=lambda pair: len(pair[1]),
        )
        raise ValueError(
            f"{len(missing)} of this {modality} model's {len(cols)} inputs are not features "
            f"this platform measures (closest match: the {name} extractor). For example: "
            f"{', '.join(missing[:5])}. It would be fed blanks for every one of them."
        )
    return cols


def select(feature_map: dict[str, float], cols: list[str]) -> np.ndarray:
    """A model's input vector, in its column order. Unmeasured features are NaN."""
    return np.array([feature_map.get(c, np.nan) for c in cols], dtype=float)
