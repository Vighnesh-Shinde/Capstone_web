"""
Loads DAIC-WOZ features and labels for training.

WHERE THE DATA COMES FROM
-------------------------
Everything needed to train is already extracted, in Friends_Work/features/:
features for all three modalities plus PHQ-8 labels and the official
train/dev/test split, for all 189 participants. Roughly 125 MB in total.

That matters because the raw DAIC-WOZ corpus is well over a hundred gigabytes,
and none of it is needed to fit these models. The heavy work — decoding audio
and video, running WavLM and mpnet, extracting facial landmarks — was done once
and saved. Fitting a classifier on a 189-row matrix afterwards is trivial:
measured at under a tenth of a second on a laptop CPU.

Download the raw corpus only to extract features that do not exist yet: a
different embedding model, a different pooling, or video re-extraction. That is
the step that wants a GPU, not this one.

THE LABEL
---------
PHQ8_Binary from text_corpus.csv, which is the DAIC-WOZ ground truth (a PHQ-8
questionnaire score, thresholded at 10). This is for reproducing and improving
the shipped models against the published benchmark.

Note the distinction from the platform's own research export, where the label
is the counsellor's assessment and never the model's prediction. Both are
"ground truth" for their own purpose; they are not interchangeable, and mixing
them in one training run would be silently averaging two different definitions
of depression.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Resolved relative to this file, so the scripts work from any directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
FEATURES_DIR = REPO_ROOT / "Friends_Work" / "features"

LABEL_FILE = FEATURES_DIR / "text_corpus.csv"
LABEL_COLUMN = "PHQ8_Binary"
SPLIT_COLUMN = "official_split"
ID_COLUMN = "Participant_ID"


@dataclass
class Dataset:
    """Feature matrix plus everything needed to evaluate it honestly."""

    X: np.ndarray
    y: np.ndarray
    split: np.ndarray          # "train" | "dev" | "test", the official DAIC-WOZ split
    participant_ids: np.ndarray
    feature_names: list[str]

    def subset(self, name: str):
        mask = self.split == name
        return self.X[mask], self.y[mask]

    def describe(self) -> str:
        lines = [f"{self.X.shape[0]} participants x {self.X.shape[1]} features"]
        for name in ("train", "dev", "test"):
            mask = self.split == name
            if not mask.any():
                continue
            pos = int(self.y[mask].sum())
            lines.append(
                f"  {name:<5} n={mask.sum():<4} depressed={pos:<4} "
                f"({100 * pos / mask.sum():.0f}%)"
            )
        return "\n".join(lines)


def _read_labels() -> dict[int, dict]:
    if not LABEL_FILE.exists():
        raise SystemExit(
            f"Labels not found at {LABEL_FILE}.\n"
            "This file carries PHQ8_Binary and the official split for all 189 "
            "participants. Without it there is nothing to train against."
        )
    with open(LABEL_FILE, encoding="utf-8", errors="replace") as fh:
        return {int(row[ID_COLUMN]): row for row in csv.DictReader(fh)}


def _read_csv_features(path: Path, drop: tuple[str, ...] = ()) -> tuple[dict[int, np.ndarray], list[str]]:
    """Participant-keyed rows from one of the *_functionals.csv files."""
    if not path.exists():
        raise SystemExit(f"Feature file not found: {path}")

    with open(path, encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        cols = [
            c for c in (reader.fieldnames or [])
            if c != ID_COLUMN and c not in drop and not c.startswith("Unnamed")
        ]
        out: dict[int, np.ndarray] = {}
        for row in reader:
            # Non-numeric or blank cells become NaN rather than crashing the
            # load; the pipeline's imputer is the right place to resolve them,
            # and dropping the participant entirely would lose a row from a
            # dataset that only has 189.
            values = []
            for c in cols:
                raw = (row.get(c) or "").strip()
                try:
                    values.append(float(raw))
                except ValueError:
                    values.append(np.nan)
            out[int(row[ID_COLUMN])] = np.asarray(values, dtype=float)
    return out, cols


def _read_npz_features(path: Path, prefix: str) -> tuple[dict[int, np.ndarray], list[str]]:
    if not path.exists():
        raise SystemExit(f"Feature file not found: {path}")
    data = np.load(path, allow_pickle=True)
    X, pids = data["X"], data["pids"]
    names = [f"{prefix}_{i}" for i in range(X.shape[1])]
    return {int(p): X[i].astype(float) for i, p in enumerate(pids)}, names


def load(modality: str) -> Dataset:
    """
    Assemble one modality's matrix.

    Text deliberately mirrors what the SHIPPED model consumes — 24 lexical
    features then 3072 mpnet columns, in that exact order — so a model trained
    here is a drop-in replacement for the one in production. Changing the order
    would produce a model that loads, predicts, and is quietly wrong, because
    nothing downstream checks anything but the column count.
    """
    labels = _read_labels()

    if modality == "text":
        lex_cols = [c for c in next(iter(labels.values())) if c.startswith("lex_")]
        embeddings, emb_names = _read_npz_features(FEATURES_DIR / "text_mpnet.npz", "mpnet")
        per_pid, names = {}, lex_cols + emb_names
        for pid, row in labels.items():
            if pid not in embeddings:
                continue
            lex = []
            for c in lex_cols:
                raw = (row.get(c) or "").strip()
                try:
                    lex.append(float(raw))
                except ValueError:
                    lex.append(np.nan)
            per_pid[pid] = np.concatenate([np.asarray(lex, dtype=float), embeddings[pid]])

    elif modality == "audio":
        # audio_functionals_v2 covers all 189; covarep covers 188 and is what
        # the shipped audio model used. v2 is the default for coverage.
        per_pid, names = _read_csv_features(
            FEATURES_DIR / "audio_functionals_v2.csv", drop=("PHQ8_Binary", "PHQ8_Score"))

    elif modality == "video":
        # Facial landmark functionals: interpretable geometry, and the widest
        # video coverage of the three video files (187 of 189). HOG is far
        # larger (8,930 columns for 186 participants) and not interpretable,
        # which matters because the report has to explain itself.
        per_pid, names = _read_csv_features(
            FEATURES_DIR / "landmark_functionals.csv", drop=("PHQ8_Binary", "PHQ8_Score"))

    else:
        raise SystemExit(f"Unknown modality {modality!r}; expected text, audio or video.")

    pids = sorted(p for p in per_pid if p in labels)
    X = np.vstack([per_pid[p] for p in pids])
    y = np.array([int(labels[p][LABEL_COLUMN]) for p in pids])
    split = np.array([labels[p][SPLIT_COLUMN] for p in pids])
    return Dataset(X, y, split, np.array(pids), names)
