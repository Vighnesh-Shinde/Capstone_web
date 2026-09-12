# Prompt for Claude Code on the GPU machine: early fusion on the official DAIC-WOZ

Copy everything below the line into Claude Code on the college GPU PC.

---

You are training depression-detection models for a web platform that already runs in
production. This is a research-grade task: work carefully, report honestly, and never
trade correctness for a better-looking number.

## 0. Hard rules (read first, obey throughout)

1. **Use ONLY the official DAIC-WOZ release**, at
   `/home/rit/Desktop/Official_capstone_project/Official_Daic-woz_Dataset`
   (confirm the path; it holds one `<id>_P` folder per participant plus the official
   split and label files).
   - **Do NOT read anything under `/home/rit/Desktop/AACapstone/archive (5)`,
     `archive (6)`, `archive (7)`, or any other folder whose path contains `archive`.**
     Not for features, labels, missing participants or checks.
   - **Do NOT reuse previously extracted feature files** (`features/`,
     `features/canonical/`, `features_copyB_legacy/`, `models_final*`). Some were built
     from the archive copies. Re-extract everything from the official folder.
   - Add a guard at the top of every script: abort if any input path contains
     `archive`.
2. **Participant 440 is corrupt in the official release. Exclude it** and do not recover
   it from elsewhere. Report the final participant count (expected 188) and every other
   exclusion with its reason.
3. **Participant speech only.** Never use the interviewer's (Ellie's) turns, and never
   use features that depend on the interviewer's timing (response latency after
   Ellie's question, gaps spanning Ellie's speech, whole-session length). Burdisso et
   al. (2024) showed that interviewer prompts alone reach ~0.83 AUC on DAIC-WOZ: that is
   leakage and it disappears in real use.
4. **Never use gender (or any demographic) as a feature.** The training data has a
   depressed-rate gap between genders that does not generalise.
5. **No test-set peeking.** Feature selection, scaling, imputation, PCA, hyperparameters
   and the decision threshold are all fitted inside the training data only (inside
   cross-validation folds). The held-out test set is scored **once**, at the very end.
6. **Do not report a number you have not computed.** If a result looks too good, assume
   leakage and investigate before believing it.
7. Do not commit or upload the corpus, extracted features or `.joblib` files to git.

## 1. The platform these models must plug into

Clone the website repository (public) next to your work:

```bash
git clone https://github.com/Vighnesh-Shinde/Capstone_web.git ~/Desktop/Capstone_web
```

Read these files completely before extracting anything. The website computes features
from live recordings with exactly this code, so **training features must come from the
same definitions** or the model will be silently wrong in production:

- `ml-service/app/real/text_features.py`: 24 lexical features + all-mpnet-base-v2
  sentence embeddings pooled as `[mean, length-weighted mean, max, std]` × 768 = 3096
  columns. Lexical features use all participant utterances; mpnet drops filler-only
  utterances; `max_length=64`.
- `ml-service/app/real/audio_features.py`: use the 64-column participant-only set
  ("clean-64"): the 85 original columns minus the 24 interviewer-dependent ones, plus
  `session_len_s_pt`, `speech_ratio_pt`, `utts_per_minute_pt`.
- `ml-service/app/real/openface_features.py`: the 224 OpenFace action-unit and gaze
  columns (`OPENFACE_COLS`). From DAIC-WOZ use `<id>_CLNF_AUs.txt` and
  `<id>_CLNF_gaze.txt`, with the same frame filter (`success==1`, `confidence>=0.75`)
  and statistics.
- `ml-service/app/real/feature_space.py`: how the website validates and feeds models
  **by column name**.

**Best practice:** import the website's own functions (`_lexical_features`,
`compute_text_features`, `compute_audio_feature_map`, `summarise`) and call them on DAIC
data, building segment objects from the participant rows of each transcript. That
guarantees parity. Then verify it: on a few participants, recompute the features
independently and show that the maximum difference is ~0 (lexical/timing) or ~1e-3
(mpnet under half precision).

Known train/deploy gap to keep in mind: DAIC transcripts split speech into short
utterance rows, while the website's diarization produces whole speaker turns. As an
extra experiment, also build a **turn-merged** variant (consecutive participant rows
not interrupted by Ellie merged into one turn) and report whether it changes results.
Do not ship it unless it is evaluated the same way.

## 2. Phase 1: dataset audit

Inventory the official folder: participants, files per participant, missing or corrupt
files, PHQ-8 distribution, binary label balance (PHQ-8 ≥ 10 → Depressed), and the
participant word and utterance counts (min / 5th percentile / median / max). The
website's too-short guard needs the minimum. Note label anomalies (for example a score
that disagrees with its binary label) without naming participants in any shareable
file.

## 3. Phase 2: literature review, then design

Search for and read peer-reviewed, well-cited work on DAIC-WOZ depression
classification, **prioritising papers with trustworthy protocols** (participant-only
input, results on the official test split or properly cross-validated, code or enough
detail to reproduce). Start from these, find their DOI / arXiv / ACL Anthology / ISCA
links yourself, and **include only papers whose links you have opened and verified**:

- Gratch et al., 2014, *The Distress Analysis Interview Corpus of human and computer
  interviews* (LREC): the dataset paper.
- Valstar et al., 2016, *AVEC 2016: Depression, Mood, and Emotion Recognition
  Workshop and Challenge*: official baselines.
- Ringeval et al., 2017, *AVEC 2017: Real-life Depression, and Affect Recognition
  Workshop and Challenge*.
- Williamson et al., 2016 (AVEC): vocal, facial and semantic cues.
- Ma et al., 2016 (AVEC): *DepAudioNet*.
- Al Hanai, Ghassemi & Glass, 2018 (Interspeech): *Detecting Depression with
  Audio/Text Sequence Modeling of Interviews*.
- Burdisso et al., 2024 (ClinicalNLP @ NAACL): the interviewer-prompt leakage
  analysis. **Read this before designing anything.**
- Recent (2021 or later) multimodal DAIC-WOZ papers that use **late fusion**
  (decision- or score-level): find at least five from reputable venues (IEEE / ACM /
  ISCA / ACL / Elsevier / Springer journals and conferences).

For every paper, record: year, venue, modalities, fusion type (early / late / hybrid),
evaluation protocol (official dev? official test? CV? a custom split?), metrics
(F1-depressed, macro-F1, accuracy, AUC), whether it uses interviewer turns (leakage
risk), and the verified link.

Then write the design: the early-fusion methods you will compare and why (see Phase 4).

**Pause here once:** show me the audit, the literature table and the design. After I
approve, run everything to the end without stopping, monitoring the jobs yourself.

## 4. Phase 3–4: split, features, training

### Split: 80% training / 20% testing
- Pool all eligible official participants (train + dev + test of the official
  release, 188 after excluding 440). Make **one stratified 80/20 split at participant
  level** (stratify on the binary label), `random_state=42`. Save the participant ID
  lists (`split_train.txt`, `split_test.txt`) so the split is reproducible.
- Inside the 80%: 5-fold stratified cross-validation for every choice (feature
  selection, k, C, PCA size, threshold). The threshold is chosen on out-of-fold
  predictions (Youden's J), never at 0.5 by default.
- The 20% test set is scored **once** for the final models.
- Because 38 test people is small, also report **repeated stratified 80/20 splits
  (10 different seeds)** as mean ± std, and **95% bootstrap confidence intervals**
  (10,000 resamples) on the single test split.
- For comparison with papers only, additionally evaluate the same pipelines on the
  **official train+dev → official test** protocol, clearly labelled as secondary.

### Early fusion (the main task)
Early fusion = one classifier on a single feature vector concatenating text (3096),
audio (64) and video (224). Known pitfall from our previous work: naive concatenation
followed by a global SelectKBest(k=50) selected 50 text features and 0 audio features.
**Early fusion must not silently discard modalities.** Compare at least:

1. Naive concatenation → impute → scale → global SelectKBest → linear classifier
   (baseline, to show the pitfall).
2. **Block-wise selection:** a `ColumnTransformer` giving each modality its own
   impute → scale → SelectKBest(k_text / k_audio / k_video) → concatenate → linear
   classifier. Tune each k inside CV.
3. **Block-wise PCA:** per-modality PCA (sizes tuned in CV) → concatenate → linear
   classifier.
4. Block weighting, so each modality's selected block contributes comparably (for
   example scaling each block by 1/√k).
5. Classifiers: logistic regression (L2 and elastic-net), linear SVM (with probability
   calibration), and optionally a small regularised MLP. **Prefer linear models:** the
   website explains predictions from coefficients, and with ~150 training people
   complex models overfit.

Also train, **on the same 80/20 split**, the late-fusion reference: text, audio and
video models separately plus a logistic stacker on their out-of-fold probabilities,
so early and late fusion are compared fairly on identical data.

Ablations: text only; text+audio (early); text+audio+video (early). Report whether
video helps; in our previous run it was below chance in CV. Handle class imbalance
with `class_weight="balanced"` and/or the tuned threshold. No SMOTE.

### Monitoring
Run long jobs in the background with logs (`nohup ... > logs/<job>.log 2>&1 &`),
check them regularly, and keep a running `results/PROGRESS.md`. When everything
finishes, report to me: final metrics, what won, what did not, and anything that
looked wrong.

## 5. Metrics to report for every model

Accuracy, balanced accuracy, precision, recall (sensitivity), specificity, F1
(Depressed), macro-F1, ROC-AUC with 95% CI, confusion matrix, threshold. Also the
cross-validated metrics on the 80%, and the gap between train AUC and CV AUC (warn if
> 0.15: overfitting).

**Goal:** beat our previous published-protocol result honestly. Previous 3-way late
fusion on the official test split: **AUC 0.768, F1 0.611, accuracy 0.702**;
cross-validated AUC about 0.69–0.73. If early fusion does not beat it under an honest
protocol, say so plainly. That is a valid result.

## 6. Packaging for the website (must follow exactly)

Save each model with **scikit-learn 1.6.1** (the website's version) using only stock
scikit-learn / numpy objects: no custom classes, lambdas or local functions inside the
pipeline, because the website cannot unpickle them. Each `.joblib` is a dict:

```python
{
  "model": fitted_pipeline,          # sklearn Pipeline, predict_proba, ALL preprocessing inside
  "threshold": 0.31,                 # float, chosen on out-of-fold training predictions
  "cols": [...],                     # input column NAMES in exact order, exactly as the website's
                                     # extractors name them: lex_*, mpnet_0..3071, the 64 audio
                                     # names, the 224 OpenFace names
  "class_names": ["Not Depressed", "Depressed"],
  "fusion": "early",
  "modalities": {"text": 3096, "audio": 64, "video": 224},   # columns per modality in cols
  "sklearn_version": "1.6.1",
  "metrics": {...},                  # test + CV metrics
}
```

Deliver at least:
- `early_fusion_text_audio_video.joblib`: the best 3-modality early-fusion model.
- `early_fusion_text_audio.joblib`: the best text+audio model (needs no OpenFace
  in production).
- The late-fusion reference bundles from the same split (text, audio, video, fusion)
  in the website's existing format, for comparison.

Write a smoke test that loads each bundle in a fresh environment with
scikit-learn 1.6.1, checks that every name in `cols` is produced by the website's
extractors (`text_features.LEX_COLS` + `mpnet_i`, `audio_features.ALL_AUDIO_COLS`,
`openface_features.OPENFACE_COLS`), and predicts on a few participants' features.
Confirm two very different participants get clearly different probabilities: a
constant output means a bug.

## 7. Folder layout (so it can be handed to the website directly)

```
EarlyFusion_Work/
  README.md              what is inside, results table, how to use
  FOR_CLAUDE_CODE.md     integration notes for the website (feature order, pitfalls)
  requirements.txt       exact versions (scikit-learn==1.6.1, numpy, ...)
  models/                the .joblib bundles above
  results/               metrics CSVs, PROGRESS.md, RESULTS.md, literature_comparison.csv
  charts/                all figures (PNG, 200 dpi)
  splits/                split_train.txt, split_test.txt (participant IDs only)
  scripts/               extract_features.py + predict.py usable by the website
  training_scripts/      everything used to train (reference only)
  logs/                  training logs
```

Keep features and the corpus out of this folder; it must be safe to share. Then zip
`EarlyFusion_Work/` without the logs.

## 8. Final report: `results/RESULTS.md`

1. Dataset audit summary and exclusions.
2. Split and protocol, and why numbers on an 80/20 split are not directly comparable
   with papers that use the official test split.
3. Results table: every early-fusion variant, every ablation, and the late-fusion
   reference, on the 80/20 test (with CIs), repeated splits (mean ± std), and the
   official-test protocol (secondary).
4. **Comparison with published late-fusion DAIC-WOZ papers:** a table with paper,
   year, venue, modalities, fusion type, protocol, reported F1/AUC/accuracy, leakage
   risk, and the **verified link**; plus a chart (`charts/comparison_with_papers.png`)
   placing our early and late fusion next to them, with markers showing each
   evaluation protocol. Explain in plain language what the comparison does and does
   not show.
5. Which model to deploy and why, its threshold and operating point, and the
   participant word/utterance minimum for the website's too-short guard.
6. An honest list of weaknesses: small test set, domain gap between DAIC-WOZ CLNF video
   and the website's OpenFace 2.2, utterance-vs-turn segmentation, US-English-only
   training data.
