# Retraining the models

Standalone scripts that turn an exported research dataset into model files the
admin can upload back into the platform. They run wherever you like — a GPU
box, a laptop — and never import the web application.

## The two rules these scripts enforce for you

**The label is the counsellor's judgment, never the model's prediction.**
Training on the model's own output teaches a new model to reproduce the current
one's mistakes, and the rows where the counsellor *disagreed* — the most
informative rows in the file — are exactly the ones it would learn to discard.

**Splits are grouped by participant, not by session.** A participant can attend
several sessions. Put session 1 in train and session 2 in test and the model
memorises that individual, then gets scored on recognising them again. The
result looks excellent and means nothing. Every split here is grouped, and the
scripts assert there is no leak.

## Setup

```bash
cd training
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # venv/bin/pip on macOS/Linux
```

## Getting a dataset

In the platform: **Admin → Dataset → Export approved dataset**. You get a ZIP
containing `features.csv`, `metadata.csv`, both transcript sets, and a README.

A session appears in it only when all three hold: the participant consented to
research reuse and has not withdrawn, an administrator approved the sample, and
a counsellor recorded an assessment.

## Running

```bash
python train_text.py   --dataset dataset.zip --out text_retrained.joblib
python train_audio.py  --dataset dataset.zip --out audio_retrained.joblib
python train_video.py  --dataset dataset.zip --out video_retrained.joblib

python train_fusion.py --dataset dataset.zip \
    --text text_retrained.joblib \
    --audio audio_retrained.joblib \
    --out fusion_retrained.joblib
```

Fusion must run last — it needs the two modality models to produce the
probabilities it learns to combine.

Each script writes the `.joblib` plus a `.report.json` with the held-out
metrics, so you can compare runs without rerunning them.

## Uploading

**Admin → Models**, pick the stage, choose the file.

The upload is rejected unless the model's input width matches the stage exactly
(text 3096, audio 85, fusion 2, video 111). That check is the point: a
mis-shaped model still loads and still returns a probability — it just returns a
meaningless one.

Activate to switch traffic over. New sessions use the new weights immediately;
existing reports are untouched. **Rollback** is activating an earlier version.

## On the video model

The research this platform builds on found that including video made the
**fused result worse**. That is why video contributes 0% today and the report
shows "Not used".

`train_video.py` exists so you can re-ask that question against your own data —
a different population and a different feature set. But note:

- A video model scoring well *on its own* is not evidence it helps. Compare
  fusion with and without it (`train_fusion.py --include-video`) and look at the
  held-out AUC.
- A video stage can be uploaded and versioned, but **activating it changes no
  prediction today.** Making it count means retraining fusion to take three
  inputs — a deliberate decision on evidence, not a side effect of an upload.
- The platform's fusion stage expects exactly 2 inputs. A 3-input fusion model
  is rejected at upload, by design.

## When it refuses to train

The scripts stop rather than warn on:

- **fewer than 40 usable sessions** — a model fitted on a dozen sessions
  produces confident, meaningless predictions, and this file goes straight into
  a tool used on real people;
- **fewer than 2 examples of either class**;
- **too few participants to cross-validate** (fusion needs honest out-of-fold
  probabilities).

`--force` overrides the size check. Use it while experimenting; do not deploy
the result.

## Interpreting the numbers

Held-out metrics are printed for every run. With small datasets they are noisy —
under 20 test sessions the scripts say so explicitly. AUC is the most stable of
them; accuracy on an imbalanced set is the least informative, because "always
predict the majority" scores well and screens nobody.

Thresholds are chosen by grouped cross-validation on the **training** data only.
Picking a threshold on the test set reports a score the model cannot reproduce.
