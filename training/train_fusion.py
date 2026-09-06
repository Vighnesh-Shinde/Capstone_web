"""
Train the FUSION model that combines the per-modality probabilities.

    python train_fusion.py --dataset dataset.zip \
        --text text_retrained.joblib --audio audio_retrained.joblib \
        --out fusion_retrained.joblib

The fusion model takes TWO numbers — the text model's probability and the
audio model's probability — and produces the final one. It is deliberately
tiny: a logistic regression on two inputs, which is enough to learn how much
to trust each modality and simple enough that its coefficients are the
"modality contributions" the report shows.

INPUT ORDER IS LOAD-BEARING
---------------------------
[text, audio], always. The ML service builds its input array in that order
and never re-checks; swapping them here produces a model that runs happily and
weights the wrong modality. That is why the order is asserted rather than
assumed, and written into the bundle's `inputs` key.

WHY THE STACKED PROBABILITIES ARE OUT-OF-FOLD
---------------------------------------------
Feeding the fusion model probabilities from models that were fitted on the
same rows teaches it that both modalities are far more accurate than they
really are — they have effectively memorised those rows. The fusion then
over-trusts them on data it has not seen. So each modality's probability here
comes from grouped cross-validation, where every prediction is made by a model
that never saw that participant.
"""

import argparse

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_predict

from common import (build_dataset, check_viable, choose_threshold, grouped_split,
                    report, write_report)


def stacked_probabilities(dataset, bundle_path, name, seed):
    """Out-of-fold probabilities from a saved modality model, refitted per fold."""
    import joblib
    from sklearn.base import clone

    bundle = joblib.load(bundle_path)
    estimator = bundle["model"]

    n_splits = min(5, len(set(dataset.groups)))
    if n_splits < 2:
        raise SystemExit(
            f"Too few participants ({len(set(dataset.groups))}) to cross-validate the "
            f"{name} model. Fusion needs honest out-of-fold probabilities."
        )

    print(f"  {name}: {n_splits}-fold grouped cross-validation...")
    return cross_val_predict(
        clone(estimator), dataset.X, dataset.y,
        cv=GroupKFold(n_splits=n_splits), groups=dataset.groups,
        method="predict_proba")[:, 1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--text", required=True, help="trained text .joblib")
    parser.add_argument("--audio", required=True, help="trained audio .joblib")
    parser.add_argument("--video", help="trained video .joblib (only with --include-video)")
    parser.add_argument("--include-video", action="store_true",
                        help="add video as a third input. The original research found "
                             "this made fusion WORSE — compare before deploying.")
    parser.add_argument("--out", default="fusion_retrained.joblib")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    print("FUSION MODEL")

    text_ds = build_dataset(args.dataset, "text_")
    audio_ds = build_dataset(args.dataset, "audio_")

    # Every modality must describe the same sessions in the same order, or row
    # i of one matrix would be paired with a different session's probability
    # from another.
    if text_ds.session_ids != audio_ds.session_ids:
        raise SystemExit(
            "Text and audio cover different sessions. Fusion needs both for every "
            "row; re-export, or drop the sessions missing a modality."
        )
    if not args.force:
        check_viable(text_ds)

    print("\n  Building out-of-fold probabilities (never in-fold — see the docstring)")
    p_text = stacked_probabilities(text_ds, args.text, "text", args.seed)
    p_audio = stacked_probabilities(audio_ds, args.audio, "audio", args.seed)

    inputs = ["text", "audio"]
    columns = [p_text, p_audio]

    if args.include_video:
        if not args.video:
            raise SystemExit("--include-video needs --video pointing at a trained model.")
        video_ds = build_dataset(args.dataset, "video_")
        if video_ds.session_ids != text_ds.session_ids:
            raise SystemExit(
                "Video covers a different set of sessions than text and audio — some "
                "recordings had no measurable face. Fusion needs all inputs for every "
                "row, so either restrict to sessions with video or leave video out."
            )
        p_video = stacked_probabilities(video_ds, args.video, "video", args.seed)
        inputs.append("video")
        columns.append(p_video)
        print("\n  NOTE: video is included. The original research found this made the")
        print("  fused result worse. Run once without --include-video and compare the")
        print("  held-out AUC before deciding which to deploy.")

    X = np.column_stack(columns)
    y = text_ds.y

    train_index, test_index = grouped_split(text_ds, args.test_size, args.seed)
    X_train, y_train = X[train_index], y[train_index]
    X_test, y_test = X[test_index], y[test_index]

    model = LogisticRegression(max_iter=1000, class_weight="balanced",
                               random_state=args.seed)
    model.fit(X_train, y_train)

    threshold = choose_threshold(y_train, model.predict_proba(X_train)[:, 1])
    probabilities = model.predict_proba(X_test)[:, 1]
    metrics = report("fusion", y_test, probabilities, threshold)

    print("\n  Learned weights (these become the report's modality contributions):")
    for name, coefficient in zip(inputs, model.coef_[0]):
        print(f"    {name:6s} {coefficient:+.4f}")

    import joblib
    from pathlib import Path
    import pandas as pd

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    # The fusion bundle's shape differs from the modality bundles: it has an
    # `inputs` key and no `cols`, matching the model it replaces.
    joblib.dump({
        "model": model,
        "threshold": float(threshold),
        "inputs": inputs,
        "trained_metrics": metrics,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
    }, args.out)

    print(f"\n  Wrote {args.out}")
    print(f"    inputs      : {inputs}  (order is load-bearing)")
    print(f"    input width : {model.n_features_in_}")
    print(f"    threshold   : {threshold}")
    if len(inputs) != 2:
        print("\n    WARNING: the platform's fusion stage expects exactly 2 inputs.")
        print("    A 3-input model will be REJECTED at upload. Use this only to")
        print("    measure whether video helps, not to deploy.")

    write_report(str(args.out) + ".report.json",
                 {"modality": "fusion", "inputs": inputs, "metrics": metrics,
                  "coefficients": model.coef_[0].tolist()})


if __name__ == "__main__":
    main()
