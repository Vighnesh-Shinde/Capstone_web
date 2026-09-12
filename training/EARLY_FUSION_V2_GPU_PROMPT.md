# Prompt 2 for the GPU machine: an early-fusion model that actually uses all three modalities

Paste everything below the line into Claude Code on the GPU machine (same repo and
corpus as the previous run).

---

Your previous run delivered `EarlyFusion_Work/models/early_fusion.joblib`. It is in
production on the website and it works — but it does not use all three modalities:

```
block weights in the shipped model:  text sum|coef| 0.5271 (22/40 components non-zero)
                                     audio64      0.0000 ( 0/10 components non-zero)
                                     video        0.0158 ( 2/10 components non-zero)
```

The elastic-net penalty zeroed the entire audio block. On a live session the report
therefore reads text 97%, audio 0%, video 3%. Extraction is NOT the cause — every
feature was measured for that session (85/85 audio values real, 224 OpenFace features,
no errors). The model simply learned to ignore audio.

This run produces **version 2**: one early-fusion model where **every modality keeps a
real, non-zero weight, with text still the strongest**, plus the explainability
artefacts described in section 3.

Everything from the previous brief still applies: official DAIC-WOZ only (the `archive`
guard stays on), participant 440 excluded, participant speech only, no interviewer
features, no gender, no test peeking, stock scikit-learn 1.6.1 objects only, and the
same evaluation protocol (stratified 80/20 with `random_state=42`, selection redone
inside each of 10 repeated splits, official-split evaluation as secondary). Keep the
turn-merged segmentation unless the repeated splits say otherwise.

## 1. Train so that no modality can be zeroed out

Changes to the model family — everything else stays:

1. **L2 only.** `LogisticRegression(penalty="l2")`. No elastic-net, no L1, nowhere.
   L1 is what removed audio; L2 shrinks weights but never deletes a block.
2. **Balance the blocks.** After each block's PCA, its components have wildly
   different scales and counts, so text dominates by construction. Give each block a
   weight and tune it: scale block *b*'s PCA output by `w_b / sqrt(k_b)` (stock
   scikit-learn: put a `StandardScaler(with_mean=False)`-style fixed scaling inside the
   block pipeline, or set `ColumnTransformer(transformer_weights={...})`, which is
   exactly this and stays picklable).
3. **Search the block weights** inside the CV, e.g. `w_text ∈ {1.0}`,
   `w_audio ∈ {0.5, 1, 2, 4}`, `w_video ∈ {0.5, 1, 2, 4}` alongside the usual PCA sizes
   and C.
4. **Acceptance rule (a product requirement, not a data finding — label it as such).**
   The shipped model must satisfy, on the training split, back-mapped through the PCA
   loadings:
   - text share of total |coefficient| mass: the largest of the three;
   - audio share ≥ 10%;
   - video share ≥ 5%.
   Among the configurations that satisfy this, pick the one with the highest mean
   inner-CV AUC across the 10 repeated splits.
5. **Report the cost, plainly.** In RESULTS.md give a table: the best unconstrained
   model (probably text-dominated again) vs the best constrained model, on repeated-split
   CV AUC, official-test AUC/F1/accuracy, and the per-modality shares of each. State in
   one sentence how much accuracy the constraint costs. If it costs a lot, say so — I
   still want the constrained model shipped, but I need to know the price.
6. Also report leave-one-modality-out CV AUC for the shipped model, as before.

## 2. Same packaging as before, with two additions

`models/early_fusion_v2.joblib`, a dict with the same keys as version 1
(`model`, `threshold`, `cols`, `blocks`, `block_sizes`, `segmentation`, `class_names`,
`fusion`, `sklearn_version`, `metrics`, `classifier`, `best_params`) **plus**:

- `"feature_means"`, `"feature_stds"`: the training mean and standard deviation of each
  of the 3,384 raw columns, in `cols` order. The website needs these to state SHAP
  values against the training distribution without shipping the corpus.
- `"block_weights"`: the chosen `w_b` per block.
- `"modality_shares"`: the back-mapped share per modality, so the website can display
  what the model actually weighs.

Keep the pipeline stock and picklable: `ColumnTransformer` of per-block
`Pipeline(imputer → scaler → PCA)` with `transformer_weights`, then
`LogisticRegression`. No custom classes, lambdas or local functions.

## 3. Explainability artefacts

### 3a. SHAP — exact, not approximate

Every stage is linear (scaler → PCA → logistic regression), so SHAP values have a
closed form and need no sampling:

```
w_original = coef[block slice] @ pca.components_          # per original column
shap_i     = w_original[i] * (scaled_i - scaled_training_mean_i)
```

and `sum_i shap_i + intercept = the model's log-odds`. Deliver:

1. `scripts/shap_values.py`: computes per-feature SHAP values for one session's feature
   vector from the bundle alone (no corpus, no background dataset), returns them grouped
   by modality, and exposes the per-modality totals.
2. A verification in `results/SHAP_VERIFICATION.md`: for at least 5 held-out
   participants, show that (a) the SHAP values sum to the model's log-odds minus the
   intercept to within 1e-8, and (b) they match `shap.LinearExplainer` on the equivalent
   linear form (install `shap` for this check only — it is NOT a runtime dependency of
   the website). Report the maximum difference.
3. Per-modality SHAP totals for the 5 participants, so the website's shares can be
   cross-checked against yours.

### 3b. Sentence-level text attribution

The 3,072 text columns are pooled sentence embeddings, so a SHAP value per column is
not readable. Decompose it to the participant's own sentences instead, which is exact
for two of the four pooling blocks:

- `mean` block: sentence *s* contributes `w · v_s / n`;
- `weighted mean`: `w · (weight_s · v_s)`;
- `max` block: each dimension's contribution belongs to the sentence that achieved the
  maximum in that dimension — assign it there;
- `std` block: non-linear. **Do not fake it.** Either exclude it from the sentence-level
  view and say so, or report it as a single unattributed remainder.

Deliver `scripts/sentence_attribution.py` taking the per-sentence embedding matrix plus
the bundle, returning each sentence's total contribution, and a verification that the
sentence totals plus the unattributed remainder equal the text block's SHAP total.

### 3c. Grad-CAM — read this before attempting it

**Grad-CAM cannot be applied to this model, and I do not want a substitute presented
under its name.** Grad-CAM needs gradients flowing through convolutional feature maps
over an image. Our video modality is 224 tabular statistics (OpenFace action-unit
intensities and gaze), and DAIC-WOZ ships no raw video to train a CNN on. What you
must deliver instead:

1. `results/GRADCAM_ASSESSMENT.md`: a short, honest statement of why Grad-CAM is not
   applicable here — no convolutional model, no frames in the corpus — and what would
   be required to make it possible (a video-frame dataset with consent, a CNN trained
   on face crops, and evaluation of whether it beats the AU features at all).
2. `results/face_region_map.json`: a mapping from every action-unit and gaze feature to
   the face region it describes, e.g.
   `{"AU04": "brows", "AU12": "mouth corners", "AU45": "eyes (blink)",
     "gaze": "eye direction"}`, covering all 14 AUs, the 6 presence flags and the gaze
   columns. The website will shade those regions on a face diagram using the SHAP
   values from 3a — a real per-region attribution, clearly labelled as "which facial
   measurements the model weighed", never as Grad-CAM.

## 4. Storage and report

Same layout as before, in `EarlyFusion_Work_v2/` (models, scripts, results, charts,
splits, logs), zipped without logs. `results/RESULTS.md` must cover: the constrained vs
unconstrained comparison and its cost, the shipped model's per-modality shares and
drop-one-modality deltas, the repeated-split and official-protocol numbers, the SHAP
verification, the sentence-attribution verification, and the Grad-CAM assessment.
Finish with `results/MORNING_SUMMARY.md` as before and print it as your final message.

## 5. Ground rules

- Do not report a number you have not computed.
- The modality floors in 1.4 are a product requirement; never describe them as evidence
  that audio or video help. If they cost accuracy, say how much.
- If a step cannot be done honestly, say so instead of producing a weak version quietly.
