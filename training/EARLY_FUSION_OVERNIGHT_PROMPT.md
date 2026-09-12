# Overnight prompt: finish the early-fusion work unattended

Paste everything below the line into the running Claude Code session on the GPU machine.

---

I am going to sleep. **Complete everything below without asking me anything and without
pausing for approval.** Every decision you need has a rule written here. Where a rule does
not cover something, choose the most conservative honest option, write the decision and
the reason in `results/DECISIONS.md`, and continue. I will read the results in the morning.

## 0. Rules that still apply (unchanged)

- Official DAIC-WOZ folder only; the `archive` guard stays on; participant 440 stays
  excluded; no reuse of old feature files.
- Participant speech only: no interviewer turns or audio, no interviewer-dependent timing.
- No gender or demographic features. No SMOTE.
- Nothing is fitted on test data: all preprocessing, PCA, selection, hyperparameters and
  the threshold live inside training folds.
- Stock scikit-learn 1.6.1 objects only in the shipped pipeline (no custom classes,
  lambdas or local functions).
- Never report a number you did not compute. Do not commit the corpus, features or
  `.joblib` files to git.
- **If a step fails:** read the log, fix the cause, and retry once. If it still fails,
  skip only that component, record it in `results/DECISIONS.md` and `results/PROGRESS.md`,
  and carry on with the rest. Never stop the whole run for one failure.

## 1. The deliverable (what "done" means)

**One early-fusion model:** a single scikit-learn `Pipeline` whose input is the concatenated
feature vector of **text + audio + video**. Inside it, a `ColumnTransformer` gives each
block its own `SimpleImputer(median) → StandardScaler → PCA`, then one linear classifier.
This is one model on concatenated features. It is the design, and it is how every
modality keeps a voice. The shipped model must contain a text block, at least one audio
block and the video block.

Goal: the best accuracy achievable **honestly**, measured by repeated-split CV and the
official-split evaluation, never by the single seed-42 test.

## 2. Finish feature extraction and prove parity

1. Let the eGeMAPS (88) and WavLM (1536) extraction finish for both segmentations
   (utterance rows and turn-merged).
2. **Before any parity check**, disable TF32 so GPU float32 really is float32:
   `torch.backends.cuda.matmul.allow_tf32 = False` and
   `torch.backends.cudnn.allow_tf32 = False`. If the GPU extraction ran with TF32 on
   (the PyTorch default for convolutions), re-extract WavLM with it off.
3. Parity: recompute eGeMAPS and WavLM **on CPU** with `scripts/audio_blocks.py` for 4
   participants and compare with the GPU features. Report max and mean |diff| per block in
   `results/PARITY.md`. Pass: eGeMAPS ~0; WavLM ≤ 1e-4 mean. If WavLM fails parity after
   TF32 is off, extract it on CPU for all participants and use that.
4. Measure CPU extraction time per minute of audio for eGeMAPS and WavLM (the website runs
   on a CPU laptop) and record it.

## 3. Choose the model by repeated, selection-inside-each-split evaluation

**Protocol:** 10 seeds. Each seed makes a stratified 80/20 participant split. Inside each
80%, run 5-fold stratified CV hyperparameter search. Score the tuned model once on that
seed's 20%. Seed 42 is the split whose IDs are already saved in `splits/`.

**Candidate block sets** (text and video always included; the audio representation is
what is being chosen):

| id | blocks |
|---|---|
| B1 | text + audio64 + video (current) |
| B2 | text + eGeMAPS + video |
| B3 | text + WavLM + video |
| B4 | text + audio64 + eGeMAPS + video |
| B5 | text + audio64 + eGeMAPS + WavLM + video (everything) |
| REF | text only: reference number, never shipped |

**Search space per block set** (use `RandomizedSearchCV`, n_iter=30, if the full grid is too slow):
- PCA components: text {10, 20, 40}; audio64 {5, 10}; eGeMAPS {5, 10, 20};
  WavLM {10, 20, 40}; video {5, 10}
- classifier: `LogisticRegression` L2 (C ∈ {0.01, 0.1, 1}) or elastic-net with `saga`
  (C ∈ {0.01, 0.1, 1}, l1_ratio ∈ {0.2, 0.5}); `class_weight` ∈ {None, "balanced"}
- optional: `BaggingClassifier` of the best linear model (n_estimators=25) as one extra
  candidate

**Segmentation:** run the protocol for both utterance and turn features.

**Runtime budget:** aim to finish within ~6 hours. Estimate the runtime after the first
seed; if it projects beyond that, reduce n_iter or drop bagging, and record the change.

**Decision rules (apply automatically):**
1. Segmentation: choose the one with the higher mean inner-CV AUC across seeds. If they
   are within 0.01, choose **turn** (it matches how the website segments speech).
2. Block set: choose the one with the highest mean inner-CV AUC across seeds. If a
   candidate with fewer or cheaper blocks is within 0.005 of the best, choose it (avoid
   WavLM unless it earns its inference cost).
3. Report the **outer 20% test AUC, F1, accuracy and balanced accuracy as mean ± std across
   the 10 seeds** for every candidate. That, not seed 42, is the headline estimate.
4. Report how often each configuration wins across seeds.

## 4. Secondary evaluation (the comparison with previous work and papers)

Official protocol with the chosen configuration: tune by 5-fold CV inside official
train+dev (440 excluded), score the official test split once. Report AUC with 95%
bootstrap CI, F1, accuracy and balanced accuracy, next to the previous published-protocol
result (AUC 0.768 / F1 0.611 / acc 0.702) and the text-only reference.

## 5. Train and package the shipped model

- Fit the chosen configuration on the **seed-42 80% training split** (the 80/20 I asked for),
  tune by 5-fold CV inside it, choose the threshold by Youden's J on out-of-fold
  predictions, and score the seed-42 20% test **once**.
- Report per-modality coefficient share (mapped back through the PCA loadings) and the
  CV AUC change when each block is dropped.
- Save `models/early_fusion.joblib` as a dict: `model`, `threshold`, `cols` (every input
  column name in exact order, including any eGeMAPS/WavLM columns), `class_names =
  ["Not Depressed", "Depressed"]`, `fusion = "early"`, `blocks` (block name → its column
  names), `segmentation` ("utt" or "turn"), `sklearn_version = "1.6.1"`, `metrics`.
- Smoke test in a fresh virtual environment with scikit-learn 1.6.1: load the bundle,
  predict on 5 participants, confirm the probabilities clearly differ between participants,
  and confirm every name in `cols` is produced by the website's extractors or by
  `scripts/audio_blocks.py`.

## 6. Website integration kit (so it can be handed over directly)

- `scripts/audio_blocks.py`: the shipped extractors, taking `(wav_path, participant
  segments with .start/.end)` and returning dicts keyed by the exact column names. CPU
  default, float32, no DAIC paths, pip-installable on Windows. Include the
  WavLM model id and its download size.
- `FOR_CLAUDE_CODE.md`: the exact pipeline structure and step names (so the website can map
  coefficients back through the PCA loadings for explanations), block definitions, the
  segmentation used and why, the too-short guard values (minimum participant words and
  minimum utterances/turns for the chosen segmentation, from the 80% training split), CPU
  timings, and required packages.
- `requirements.txt` with exact versions.

## 7. Literature comparison

Finish the table with verified rows only, marking the protocol and dataset of each (label
E-DAIC rows). If PDFs have appeared in `~/Desktop/papers/`, extract and verify them. Build
`charts/comparison_with_papers.png` showing our final early-fusion model (repeated-split
mean ± std, and the official-protocol result) next to the verified papers, with markers for
each evaluation protocol. If fewer than five recent late-fusion papers could be verified,
say so in the report and name what blocked the rest. Never include unverified numbers.

## 8. Storage (final layout)

```
EarlyFusion_Work/
  README.md  FOR_CLAUDE_CODE.md  requirements.txt
  models/early_fusion.joblib
  scripts/            audio_blocks.py, extract_features.py, predict.py
  training_scripts/   everything used, reference only
  splits/             split_train.txt, split_test.txt (+ the other 9 seeds' ID lists)
  results/            RESULTS.md, DECISIONS.md, PROGRESS.md, PARITY.md,
                      repeated_splits.csv, official_protocol.csv, ablation.csv,
                      literature_comparison.csv, MORNING_SUMMARY.md
  charts/             repeated-split box plot per candidate, ablation bars, ROC + confusion
                      matrix of the shipped model, modality contribution shares,
                      early vs late fusion, comparison_with_papers.png
  logs/
```

No corpus files and no extracted feature matrices in this folder. Zip it (without `logs/`)
as `EarlyFusion_Work.zip` when everything is done.

## 9. When everything has finished

Write `results/MORNING_SUMMARY.md`, one page in plain language:
- what ran and what failed or was skipped (and why);
- the chosen configuration (segmentation, blocks, classifier) and why the rules picked it;
- headline numbers: repeated-split mean ± std, official-protocol result, text-only
  reference, previous work;
- whether early fusion genuinely beat text-only and the previous work, stated honestly
  (including "no" if that is the answer);
- the deliverables and where they are.

Then print that summary as your final message.
