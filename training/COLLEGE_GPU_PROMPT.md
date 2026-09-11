# Prompt for Claude Code on the GPU machine

Copy everything below the line into Claude Code on the college PC, in the repo
clone, with the official DAIC-WOZ corpus downloaded.

---

I have the official DAIC-WOZ corpus (AVEC 2016/2017 distribution) downloaded on
this machine, which has a CUDA GPU. This repo is a depression-screening platform
that already runs in production; you are training replacement models for it.

Work in phases and **stop for my confirmation at the end of each**. Do not
skip ahead to training.

## Phase 1 — Understand the corpus before touching it

Inventory what was actually downloaded: participant count, which files exist per
participant, total size, and anything missing or corrupt. Report the PHQ-8 label
distribution and the official `train` / `dev` / `test` split sizes from the
`*_split_Depression_AVEC2017.csv` files.

Then characterise it: interview duration, participant word counts, utterance
counts — min, median, max, and the full distribution. I need these numbers
concretely; they matter later for a production guard.

Report anything that would bias a model. Look specifically at class balance,
gender balance, and any participant present in more than one split.

## Phase 2 — Read the literature before designing anything

Search for and read the current work on DAIC-WOZ depression detection: the AVEC
2016/2017 baselines, and what has been published since. Tell me the AUC / F1
numbers that count as respectable so we can judge our own results honestly
rather than against nothing.

**One specific thing you must find and account for.** There is published work
(Burdisso et al., 2024, Idiap) showing that DAIC-WOZ leaks badly through the
*interviewer's* side of the conversation — a model reading only Ellie's question
IDs reaches ~0.826 AUC while learning nothing about the participant. Any model
trained on the full transcript is partly exploiting that. Find this work, read
it, and tell me how you will avoid the leak.

Report what you found and what design it implies. Do not start building until I
agree with the design.

## Phase 3 — Feature extraction that matches production exactly

This is the step where this project has already been burned, so read carefully.

The platform extracts features from live recordings at inference time using:

- `ml-service/app/real/text_features.py`
- `ml-service/app/real/audio_features.py`

**Read both files completely before writing any extraction code.** A model
trained on features computed even slightly differently from these will load
fine, return confident numbers, and be silently wrong. That has already happened
here once: a distribution mismatch pinned the text model's output to 0.2542 for
every recording, and because the fusion threshold was 0.48, every single session
came back "depressed" with a plausible-looking confidence.

You have two legitimate options. Choose deliberately and tell me which:

1. **Match the existing extraction exactly.** Reproduce those functions'
   output on DAIC-WOZ. Feature counts must come out at text 3096, audio 85.
2. **Design better features.** Allowed and possibly correct — but then you must
   also deliver the rewritten `text_features.py` / `audio_features.py` so
   extraction and model ship as a matched pair, plus the new column names so
   the extractors listed in `ml-service/app/real/feature_space.py` can be
   updated in lockstep.

Whichever you choose, non-negotiable:

- **Participant speech only.** Never train on interviewer turns (Phase 2).
- If you use sentence embeddings with pooling, **document the block order
  explicitly**. The current text vector is 24 lexical features followed by
  3072 mpnet columns arranged as `[mean, weighted-mean, max, std]`, 768 each.
  Getting this order wrong is undetectable downstream — nothing validates
  anything but the total column count.
- Use the GPU for extraction. That is what it is for here; the fitting itself
  is trivial.

## Phase 4 — Train four models

Text, audio, video, and a fusion model over their outputs.

- Fit on `train`. Tune on `dev`. **Touch `test` exactly once, at the end.** A
  threshold or hyperparameter chosen on test makes the test score a description
  of your tuning, not an estimate of future performance.
- Do not leave the decision threshold at 0.5. Only ~30% of participants are
  depressed; choose it on `dev` by balanced accuracy or Youden's J and report
  sensitivity and specificity at the chosen point.
- Report **cross-validated** AUC on train alongside the plain train AUC. With
  189 participants and thousands of candidate features, overfitting is the
  default outcome; if train AUC greatly exceeds cross-validated AUC, say so
  rather than reporting the flattering number.
- **Audio and video must use a linear classifier** (logistic regression or
  linear SVM). The platform's report explains a prediction using model
  coefficients; an RBF kernel has none, which is exactly why the current report
  can explain audio but not text. If you can make text linear without losing
  much AUC, do it — that would fix a real gap.
- Dev is 35 people and test is 47. Give confidence intervals or bootstrap
  estimates. Do not present a difference of a few points between two models as
  meaningful at that sample size.

## Phase 5 — Package for upload

Each model must be a `joblib` dict with exactly these keys:

```python
{
  "model":       fitted_pipeline,      # must expose predict_proba
  "threshold":   0.42,                 # float, chosen on dev
  "cols":        [...],                # feature names, in model input order
  "class_names": ["Not Depressed", "Depressed"],
}
```

The platform validates uploads by the NAMES in `cols`
(`ml-service/app/real/feature_space.py`) and rejects any model naming an input
it does not measure. Accepted today: **text 3096** (24 lexical + 3072 mpnet),
**audio 85 or 64** (the original set, or the participant-only "clean-64"),
**video 111 or 224** (MediaPipe geometry, or OpenFace action units + gaze), and
**fusion 2 or 3**.

The fusion model's input width decides which modalities it combines:

- **2 inputs** → `[p_text, p_audio]`. Video is not used.
- **3 inputs** → `[p_text, p_audio, p_video]`, in exactly that order.

Deliver a two-input fusion model **and**, if video earns its place, a
three-input one, and report both so I can choose on evidence. The previous
project found video made the fused result worse; check whether that holds here.

Column order is checked by nothing. A fusion model trained on a different order
loads, predicts, and is silently wrong. A three-input fusion can only be
activated once a video model is active for the same language.

### Video — read this before training a video model

Production extracts video features with **MediaPipe Face Mesh** —
`ml-service/app/real/video_features.py`, 111 features. As far as I know,
DAIC-WOZ does not distribute the interview video itself, only features already
extracted with **OpenFace/CLNF**, and those are not interchangeable with
MediaPipe's landmarks: even where column names look alike, the numbers mean
different things. A video model trained on the corpus's CLNF files would pass
the width check only by coincidence and would be wrong on every live session.

So, before training a video model:

1. Check whether your download actually contains raw video. If it does, run
   `video_features.py` on it so training matches production exactly.
2. If it contains only CLNF features, you may instead deliver an OpenFace-based
   `video_features.py` for production together with the model, as a matched
   pair, plus its new feature count.
3. If neither is workable, say so plainly. Do **not** ship a CLNF-trained model
   against MediaPipe extraction.

## Phase 6 — Report

Write `training/RESULTS.md` covering: what you found in Phase 1, what the
literature said and how you handled the interviewer leak, the feature design and
why, per-model results (train / CV / dev / test, with intervals), the chosen
thresholds and operating points, and an honest list of what is weak.

Also report, as concrete numbers, the **minimum and median participant word and
utterance counts** in the training set. Production refuses to score interviews
shorter than the training range — a real bug we hit, where short recordings
produced a constant output that always read as "depressed" — and those constants
live in `ml-service/app/real/adequacy.py` and must be updated to match whatever
you train on.

Commit the scripts. Do not commit the corpus, the extracted features, or the
`.joblib` files — I move those manually.

## Ground rules

- Do not report a number you have not actually computed.
- If a result looks too good, assume leakage and investigate before believing it.
- If something cannot be done well, say so plainly instead of producing a weak
  version quietly.
- Prefer a defensible 0.70 AUC to an unexplainable 0.85.
