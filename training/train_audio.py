"""
Retrain the AUDIO model from an exported research dataset.

    python train_audio.py --dataset dataset.zip --out audio_retrained.joblib

Reads the 85 acoustic features per session (pitch, jitter, shimmer, pause
timing, speech rate and their functionals) that the platform extracted from
PARTICIPANT speech only — the counsellor's voice was removed by voiceprint
matching before these numbers were computed.

A linear classifier by design, not by accident: the platform's report shows
per-feature contributions for audio, and that explanation is computed from
linear coefficients. Swap in a kernel or a tree and the report silently loses
its explanation panel.
"""

import argparse

from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from common import (build_dataset, check_viable, choose_threshold, grouped_split,
                    report, save_bundle, write_report)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--out", default="audio_retrained.joblib")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--k-features", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    print("AUDIO MODEL")
    dataset = build_dataset(args.dataset, "audio_")
    print(f"  {dataset.summary()}")
    if not args.force:
        check_viable(dataset)

    train_index, test_index = grouped_split(dataset, args.test_size, args.seed)
    X_train, y_train = dataset.X[train_index], dataset.y[train_index]
    X_test, y_test = dataset.X[test_index], dataset.y[test_index]
    groups_train = dataset.groups[train_index]

    pipeline = Pipeline([
        ("imp", SimpleImputer(strategy="median")),
        ("sc", StandardScaler()),
        ("sel", SelectKBest(f_classif, k=min(args.k_features, X_train.shape[1]))),
        # Step names matter as much as the types: the ML service's explanation
        # code looks up "imp", "sc", "sel" and "clf" by name to reconstruct each
        # feature's contribution. Renaming a step breaks the report, not the
        # prediction, so it would fail quietly.
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced",
                                   random_state=args.seed)),
    ])

    print("\n  Choosing the threshold by grouped cross-validation on TRAIN only...")
    n_splits = min(5, len(set(groups_train)))
    if n_splits >= 2:
        oof = cross_val_predict(
            pipeline, X_train, y_train,
            cv=GroupKFold(n_splits=n_splits), groups=groups_train,
            method="predict_proba")[:, 1]
        threshold = choose_threshold(y_train, oof)
    else:
        print("    too few participants to cross-validate; falling back to 0.5")
        threshold = 0.5

    pipeline.fit(X_train, y_train)
    probabilities = pipeline.predict_proba(X_test)[:, 1]
    metrics = report("audio", y_test, probabilities, threshold)

    save_bundle(args.out, pipeline, threshold, dataset.columns,
                model_name="LogisticRegression (retrained)",
                approach="audio: 85 prosodic features -> impute/scale/select/logreg",
                metrics=metrics)
    write_report(str(args.out) + ".report.json",
                 {"modality": "audio", "metrics": metrics,
                  "n_sessions": len(dataset), "n_features": dataset.X.shape[1]})


if __name__ == "__main__":
    main()
