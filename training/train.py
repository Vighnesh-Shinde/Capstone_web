"""
Train a depression-screening model and write a bundle the admin page accepts.

    python training/train.py --modality text
    python training/train.py --modality audio
    python training/train.py --modality video

One script with a --modality flag rather than three near-identical files. The
three differ only in which features they load; the fitting, the threshold
choice, the honesty checks and the bundle format are identical, and three
copies of that would drift apart the first time one was fixed.

WHAT IT PRODUCES
    training/<modality>_<timestamp>.joblib   upload via Admin -> Models
    training/<modality>_<timestamp>.report.json

The bundle carries the keys the platform validates on upload: `model` with
predict_proba, `threshold`, `cols`, and `class_names`. The upload is rejected
unless the input width matches what the pipeline extracts, which is the check
that stops a mis-shaped model from silently returning meaningless numbers.

THIS DOES NOT NEED A GPU
189 participants. Measured at under a tenth of a second on a laptop CPU. A GPU
matters for re-extracting features from raw media, not for fitting this.
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from dataset import load

OUT_DIR = Path(__file__).resolve().parent


def build_pipeline(modality: str, k: int, seed: int) -> Pipeline:
    """
    Mirrors the shipped pipeline shape: impute -> scale -> select -> classify.

    SelectKBest is not decoration. With 189 participants and up to 3,096
    columns there are more features than samples by an order of magnitude, and
    without aggressive selection the model memorises the training split — see
    the overfitting note printed at the end of every run.

    Audio and video use a LINEAR classifier on purpose. The report attributes a
    prediction to individual features using the model's coefficients, and an
    RBF kernel has none; the shipped text model is RBF, which is exactly why
    the report can explain audio but not text.
    """
    classifier = (
        SVC(class_weight="balanced", probability=True, random_state=seed)
        if modality == "text"
        else LogisticRegression(
            class_weight="balanced", max_iter=2000, random_state=seed)
    )
    return Pipeline([
        ("imp", SimpleImputer(strategy="median")),
        ("sc", StandardScaler()),
        ("sel", SelectKBest(f_classif, k=k)),
        ("clf", classifier),
    ])


def choose_threshold(y_true: np.ndarray, scores: np.ndarray) -> tuple[float, dict]:
    """
    Pick the cut-off that maximises balanced accuracy, on the DEV split.

    Not 0.5. Only about 30% of participants are depressed, so a default
    threshold trades away nearly all recall on the class the tool exists to
    find. Chosen on dev and never on test, because a threshold tuned on the
    test split makes the test score a description of the tuning rather than an
    estimate of future performance.
    """
    best = (0.5, -1.0, {})
    for t in np.unique(np.round(scores, 4)):
        pred = (scores >= t).astype(int)
        tp = int(((pred == 1) & (y_true == 1)).sum())
        tn = int(((pred == 0) & (y_true == 0)).sum())
        fp = int(((pred == 1) & (y_true == 0)).sum())
        fn = int(((pred == 0) & (y_true == 1)).sum())
        sens = tp / (tp + fn) if tp + fn else 0.0
        spec = tn / (tn + fp) if tn + fp else 0.0
        balanced = (sens + spec) / 2
        if balanced > best[1]:
            best = (float(t), balanced,
                    {"sensitivity": sens, "specificity": spec,
                     "balanced_accuracy": balanced,
                     "tp": tp, "tn": tn, "fp": fp, "fn": fn})
    return best[0], best[2]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modality", required=True, choices=["text", "audio", "video"])
    ap.add_argument("--k", type=int, default=25,
                    help="features to keep (default 25; more overfits 189 samples)")
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--tag", default="", help="appended to the output filename")
    args = ap.parse_args()

    data = load(args.modality)
    print(f"\n{args.modality.upper()}\n{data.describe()}\n")

    X_tr, y_tr = data.subset("train")
    X_dev, y_dev = data.subset("dev")
    X_te, y_te = data.subset("test")

    if len(np.unique(y_tr)) < 2:
        raise SystemExit("The training split has only one class; cannot fit.")

    pipe = build_pipeline(args.modality, min(args.k, X_tr.shape[1]), args.seed)
    started = time.time()
    pipe.fit(X_tr, y_tr)
    fit_seconds = time.time() - started

    # Cross-validated on train as well as scored on the held-out splits. A
    # single dev number on 35 participants moves a lot with one flipped case,
    # and reporting only that would overstate how much is actually known.
    cv = cross_val_predict(
        build_pipeline(args.modality, min(args.k, X_tr.shape[1]), args.seed),
        X_tr, y_tr, cv=StratifiedKFold(5, shuffle=True, random_state=args.seed),
        method="predict_proba")[:, 1]

    scores = {
        "train_auc": float(roc_auc_score(y_tr, pipe.predict_proba(X_tr)[:, 1])),
        "train_cv_auc": float(roc_auc_score(y_tr, cv)),
        "dev_auc": float(roc_auc_score(y_dev, pipe.predict_proba(X_dev)[:, 1])) if len(y_dev) else None,
        "test_auc": float(roc_auc_score(y_te, pipe.predict_proba(X_te)[:, 1])) if len(y_te) else None,
    }

    threshold, operating = choose_threshold(y_dev, pipe.predict_proba(X_dev)[:, 1]) \
        if len(y_dev) else (0.5, {})

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"{args.modality}_{stamp}{('_' + args.tag) if args.tag else ''}"

    bundle = {
        "model": pipe,
        "threshold": threshold,
        "cols": data.feature_names,
        "class_names": ["Not Depressed", "Depressed"],
        "approach": f"{args.modality} / SelectKBest({args.k}) / "
                    f"{pipe.named_steps['clf'].__class__.__name__}",
        "trained_at": stamp,
        "n_train": int(len(y_tr)),
        "scores": scores,
    }
    joblib.dump(bundle, OUT_DIR / f"{name}.joblib")
    (OUT_DIR / f"{name}.report.json").write_text(json.dumps({
        "modality": args.modality, "scores": scores, "threshold": threshold,
        "operating_point_on_dev": operating, "n_features": int(X_tr.shape[1]),
        "k": args.k, "seed": args.seed, "fit_seconds": round(fit_seconds, 3),
        "machine": f"{platform.system()} {platform.machine()}",
    }, indent=2), encoding="utf-8")

    print(f"fitted in {fit_seconds:.2f}s on {platform.system()} CPU\n")
    for key, value in scores.items():
        if value is not None:
            print(f"   {key:<14} {value:.3f}")
    print(f"\n   threshold      {threshold:.4f} (chosen on dev)")
    if operating:
        print(f"   sensitivity    {operating['sensitivity']:.2f}"
              f"   specificity {operating['specificity']:.2f}")

    gap = scores["train_auc"] - (scores["train_cv_auc"] or 0)
    if gap > 0.15:
        print(f"\n   WARNING: train AUC exceeds cross-validated AUC by {gap:.2f}.")
        print("   The model is memorising the training split rather than learning a")
        print("   pattern that generalises. Lower --k before trusting these numbers.")

    print(f"\nwrote {name}.joblib  ->  upload at Admin -> Models\n")


if __name__ == "__main__":
    main()
