"""
Shared machinery for the retraining scripts.

Deliberately separate from the web application: these run on a GPU box, on an
exported dataset, on whatever schedule the operator likes. The application
never imports them and they never import the application. The only contract
between them is the shape of the exported ZIP and the shape of the .joblib
bundle the admin uploads back.

THE TWO THINGS THAT ARE EASY TO GET WRONG
-----------------------------------------
1. The label is the COUNSELLOR'S judgment, never the model's prediction.
   Training on the model's own output teaches a new model to reproduce the
   current one's mistakes, and the rows where the counsellor disagreed — the
   most informative rows in the file — would be exactly the ones it learns to
   discard. The export already does this correctly; these scripts read the
   `label` column and never touch `ai_prediction`.

2. Splitting is BY PARTICIPANT, not by session. A participant can attend
   several sessions. Put session 1 in train and session 2 in test and the
   model gets to memorise that individual's voice and vocabulary, then is
   scored on recognising them again. The result is a number that looks
   excellent and means nothing. Every split here is grouped by participant.
"""

from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


CLASS_NAMES = ["Not Depressed", "Depressed"]


@dataclass
class Dataset:
    """One modality's matrix, its labels, and the participant each row belongs to."""

    X: np.ndarray
    y: np.ndarray
    groups: np.ndarray          # participant reference per row, for grouped splits
    columns: list[str]
    session_ids: list[str]

    def __len__(self) -> int:
        return int(self.X.shape[0])

    def summary(self) -> str:
        positives = int(self.y.sum())
        return (
            f"{len(self)} sessions from {len(set(self.groups))} participants "
            f"({positives} depressed / {len(self) - positives} not depressed), "
            f"{self.X.shape[1]} features"
        )


def load_export(path: str | Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Read features.csv and metadata.csv out of an exported dataset.

    Accepts either the ZIP the admin downloaded or a directory it was extracted
    into, because people do both and failing on one of them is a pointless
    obstacle at the start of a training run.
    """
    path = Path(path)

    if path.is_dir():
        features = pd.read_csv(path / "features.csv")
        metadata = pd.read_csv(path / "metadata.csv")
        return features, metadata

    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            with archive.open("features.csv") as handle:
                features = pd.read_csv(handle)
            with archive.open("metadata.csv") as handle:
                metadata = pd.read_csv(handle)
        return features, metadata

    raise SystemExit(f"{path} is neither a .zip export nor a directory containing one.")


def build_dataset(export_path: str | Path, prefix: str) -> Dataset:
    """
    Pull one modality's columns out of the export.

    `prefix` is "text_", "audio_" or "video_". Rows with no values for that
    modality are dropped rather than imputed: a session where no face could be
    measured has no video information at all, and inventing a plausible face
    for it would be fabricating training data.
    """
    features, metadata = load_export(export_path)

    columns = [c for c in features.columns if c.startswith(prefix)]
    if not columns:
        raise SystemExit(
            f"No '{prefix}*' columns in this export. Either no session has "
            f"{prefix.rstrip('_')} features yet, or the export predates them."
        )

    frame = features[["session_id", "label"] + columns].copy()

    before = len(frame)
    frame = frame.dropna(subset=columns, how="all")
    dropped = before - len(frame)
    if dropped:
        print(f"  dropped {dropped} session(s) with no {prefix.rstrip('_')} features")

    # Participant, so splits can be grouped. Falls back to session id — which
    # makes every row its own group and the split degenerate to ungrouped —
    # only if metadata is missing the column, and says so loudly.
    if "participant_ref" in metadata.columns:
        mapping = dict(zip(metadata["session_id"], metadata["participant_ref"]))
        groups = frame["session_id"].map(mapping).fillna(frame["session_id"])
    else:
        print("  WARNING: metadata.csv has no participant_ref column; grouping by "
              "session instead. Repeat visits by the same person may leak between "
              "train and test, inflating every score below.")
        groups = frame["session_id"]

    X = frame[columns].to_numpy(dtype=float)
    y = frame["label"].to_numpy(dtype=int)

    return Dataset(
        X=X,
        y=y,
        groups=groups.to_numpy(),
        columns=columns,
        session_ids=frame["session_id"].astype(str).tolist(),
    )


def check_viable(dataset: Dataset, minimum: int = 40) -> None:
    """
    Refuse to train on a dataset too small to mean anything.

    A model fitted on a dozen sessions will report a confident accuracy and
    generalise to nothing. Since the resulting file is uploadable straight into
    a clinical screening tool, this stops rather than warns.
    """
    if len(dataset) < minimum:
        raise SystemExit(
            f"\nRefusing to train: only {len(dataset)} usable sessions "
            f"(minimum {minimum}).\n"
            f"A model fitted on this little data will produce confident, "
            f"meaningless predictions, and this file can be uploaded straight "
            f"into a screening tool used on real people.\n"
            f"Collect more sessions, or pass --force if you are experimenting "
            f"and will not deploy the result."
        )

    smaller_class = min(int(dataset.y.sum()), len(dataset) - int(dataset.y.sum()))
    if smaller_class < 2:
        raise SystemExit(
            f"Refusing to train: the smaller class has {smaller_class} example(s). "
            f"Both 'depressed' and 'not depressed' need to be represented."
        )


def grouped_split(dataset: Dataset, test_size: float, seed: int):
    """
    Train/test indices that never put one participant on both sides.

    See this module's docstring — this is the single most consequential detail
    in the whole training setup.
    """
    from sklearn.model_selection import GroupShuffleSplit

    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    train_index, test_index = next(splitter.split(dataset.X, dataset.y, dataset.groups))

    overlap = set(dataset.groups[train_index]) & set(dataset.groups[test_index])
    if overlap:
        # Cannot happen with GroupShuffleSplit, but this is the assumption every
        # number below rests on, so it is asserted rather than trusted.
        raise SystemExit(f"Participant leak between train and test: {overlap}")

    return train_index, test_index


def choose_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    """
    The decision threshold that maximises F1 on the data given.

    Chosen on validation data by the caller, never on the test set — picking it
    on test is a quiet way to report a score the model cannot reproduce.

    F1 rather than accuracy because the classes are usually imbalanced, and a
    threshold tuned for accuracy on an imbalanced set tends toward "always
    predict the majority", which scores well and screens nobody.
    """
    from sklearn.metrics import f1_score

    best_threshold, best_score = 0.5, -1.0
    for candidate in np.linspace(0.05, 0.95, 91):
        score = f1_score(y_true, (probabilities >= candidate).astype(int), zero_division=0)
        if score > best_score:
            best_threshold, best_score = float(candidate), float(score)
    return round(best_threshold, 4)


def report(name: str, y_true: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    """Honest held-out metrics, printed and returned for the bundle."""
    from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                                 precision_score, recall_score, roc_auc_score)

    predictions = (probabilities >= threshold).astype(int)

    # AUC is undefined when the held-out set happens to be all one class, which
    # is common with small datasets and grouped splits.
    try:
        auc = float(roc_auc_score(y_true, probabilities))
    except ValueError:
        auc = float("nan")

    metrics = {
        "n_test": int(len(y_true)),
        "threshold": threshold,
        "auc": auc,
        "accuracy": float(accuracy_score(y_true, predictions)),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
        "f1": float(f1_score(y_true, predictions, zero_division=0)),
    }

    print(f"\n  Held-out performance for {name}")
    print(f"    sessions   : {metrics['n_test']}")
    print(f"    AUC        : {metrics['auc']:.3f}")
    print(f"    accuracy   : {metrics['accuracy']:.3f}")
    print(f"    precision  : {metrics['precision']:.3f}")
    print(f"    recall     : {metrics['recall']:.3f}")
    print(f"    F1         : {metrics['f1']:.3f}")
    print(f"    threshold  : {threshold}")
    print(f"    confusion  : {confusion_matrix(y_true, predictions).tolist()}")

    if metrics["n_test"] < 20:
        print("\n    NOTE: this held-out set is tiny. Treat every number above as "
              "an indication, not a measurement.")

    return metrics


def save_bundle(
    path: str | Path,
    model,
    threshold: float,
    columns: list[str] | None,
    model_name: str,
    approach: str,
    metrics: dict,
) -> None:
    """
    Write the .joblib in the exact shape the platform expects.

    The keys are not arbitrary: ModelVersionService rejects an upload whose
    input width does not match the stage, and the ML service reads `model`,
    `threshold`, `cols` and `class_names` by name. Getting this wrong produces
    a file that uploads and then fails at inference, which is the worst place
    to discover it.
    """
    import joblib

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    bundle = {
        "model": model,
        "threshold": float(threshold),
        "model_name": model_name,
        "approach": approach,
        "class_names": CLASS_NAMES,
        # Provenance, so a file found on disk in six months can be traced back
        # to what produced it.
        "trained_metrics": metrics,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
    }
    if columns is not None:
        bundle["cols"] = columns

    joblib.dump(bundle, path)

    width = getattr(model, "n_features_in_", None)
    print(f"\n  Wrote {path}")
    print(f"    input width : {width}")
    print(f"    threshold   : {threshold}")
    print(f"\n  Upload it in the platform: Admin -> Models -> select the stage, "
          f"choose this file.")
    print(f"  The upload is rejected unless its input width matches the stage "
          f"exactly, which is the check that stops a mis-shaped model from "
          f"silently returning meaningless probabilities.")


def write_report(path: str | Path, payload: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"  Wrote {path}")
