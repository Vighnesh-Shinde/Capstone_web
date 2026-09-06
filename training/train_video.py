"""
Train the VIDEO model from an exported research dataset.

    python train_video.py --dataset dataset.zip --out video_retrained.joblib

Reads the 111 facial-geometry features per session — mouth and eye apertures,
brow distances, and how much each moves — extracted by MediaPipe Face Mesh and
normalised by inter-ocular distance.

READ THIS BEFORE DEPLOYING THE RESULT
-------------------------------------
The research project this platform is built on evaluated a video model and
found that including it made the FUSED result WORSE, not better. That is why
video contributes 0% to the current prediction and the report shows it as
"Not used".

Nothing here contradicts that finding. This script exists so the question can
be re-asked against real data from this platform, which is a different
population and a different feature set from the one that produced the original
result. Train it, look at the held-out numbers, then compare a fusion with and
without it (train_fusion.py --include-video) before concluding anything.

A video model that scores well on its own is not evidence that it helps. The
only number that matters is whether the fusion improves.
"""

import argparse

from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from common import (build_dataset, check_viable, choose_threshold, grouped_split,
                    report, save_bundle, write_report)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--out", default="video_retrained.joblib")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    print("VIDEO MODEL")
    dataset = build_dataset(args.dataset, "video_")
    print(f"  {dataset.summary()}")
    if not args.force:
        check_viable(dataset)

    train_index, test_index = grouped_split(dataset, args.test_size, args.seed)
    X_train, y_train = dataset.X[train_index], dataset.y[train_index]
    X_test, y_test = dataset.X[test_index], dataset.y[test_index]
    groups_train = dataset.groups[train_index]

    # A forest rather than a linear model: these features interact (mouth
    # movement means something different depending on how much the whole face
    # moves) and there are few enough of them that a forest will not instantly
    # overfit. No selection step — the forest does its own.
    pipeline = Pipeline([
        ("imp", SimpleImputer(strategy="median")),
        ("sc", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=400, min_samples_leaf=2, class_weight="balanced",
            random_state=args.seed, n_jobs=-1)),
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
    metrics = report("video", y_test, probabilities, threshold)

    print("\n  Reminder: a good score here does NOT mean video should be added to")
    print("  the prediction. Compare fusion with and without it before deciding.")

    save_bundle(args.out, pipeline, threshold, dataset.columns,
                model_name="RandomForest (retrained)",
                approach="video: 111 MediaPipe facial-geometry features -> impute/scale/forest",
                metrics=metrics)
    write_report(str(args.out) + ".report.json",
                 {"modality": "video", "metrics": metrics,
                  "n_sessions": len(dataset), "n_features": dataset.X.shape[1]})


if __name__ == "__main__":
    main()
