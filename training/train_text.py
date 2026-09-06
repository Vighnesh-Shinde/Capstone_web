"""
Retrain the TEXT model from an exported research dataset.

    python train_text.py --dataset dataset.zip --out text_retrained.joblib

Reads the 3,096 text features per session that the platform already extracts
(24 hand-counted language habits + mpnet sentence-meaning summaries) and fits
a classifier on top. The features are NOT recomputed here — they come straight
out of the export, which is what makes the recordings deletable.

Pipeline shape matches the model this replaces: median imputation ->
standardisation -> univariate selection -> classifier. Keeping the shape means
the platform's existing explanation code continues to work.
"""

import argparse

from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from common import (build_dataset, check_viable, choose_threshold, grouped_split,
                    report, save_bundle, write_report)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, help="exported .zip or extracted directory")
    parser.add_argument("--out", default="text_retrained.joblib")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--k-features", type=int, default=25,
                        help="features kept by univariate selection (25 matches the shipped model)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true", help="train even on too little data")
    args = parser.parse_args()

    print("TEXT MODEL")
    dataset = build_dataset(args.dataset, "text_")
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
        # k cannot exceed the number of available features, which it can on a
        # small export where whole columns were dropped as all-NaN.
        ("sel", SelectKBest(f_classif, k=min(args.k_features, X_train.shape[1]))),
        # probability=True is required: the platform reads predict_proba, and a
        # bare SVC does not have it.
        ("clf", SVC(kernel="rbf", C=1.0, gamma="scale", probability=True,
                    class_weight="balanced", random_state=args.seed)),
    ])

    print("\n  Choosing the threshold by grouped cross-validation on TRAIN only...")
    # The threshold is picked from out-of-fold predictions on training data.
    # Picking it on the test set would report a score the model cannot
    # reproduce on anything it has not seen.
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
    metrics = report("text", y_test, probabilities, threshold)

    save_bundle(args.out, pipeline, threshold, dataset.columns,
                model_name="SVM-RBF (retrained)",
                approach="text: 24 lexical + mpnet summaries -> impute/scale/select/SVM",
                metrics=metrics)
    write_report(str(args.out) + ".report.json",
                 {"modality": "text", "metrics": metrics,
                  "n_sessions": len(dataset), "n_features": dataset.X.shape[1]})


if __name__ == "__main__":
    main()
