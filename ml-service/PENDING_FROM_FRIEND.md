# Real feature extraction — status

**Both stubs are now filled in.** Your friend's full research repo
(`Friends_Work/`, including `src/extract_text_features.py` and
`src/extract_audio_features_v2.py`) arrived and was used to implement:

1. **`ml-service/app/real/text_features.py`** — `compute_text_features(participant_segments)`
   returns the real 3096-float vector: 24 hand-counted lexical features
   (word counts, pronoun rates, sentiment — ported verbatim from the
   friend's script) + 3072 `all-mpnet-base-v2` sentence-embedding aggregates
   (mean/weighted-mean/max/std pooling, also ported verbatim). Column order
   verified against `friend_shared_work/_inspected_metadata/model1_text.json`.

2. **`ml-service/app/real/audio_features.py`** — `compute_audio_features(wav_path, transcript)`
   returns the real 85-float vector: speaking-rhythm/timing features (utterance
   duration, response latency, pauses) plus YIN-based pitch/loudness prosody,
   ported from the friend's script and adapted to read from
   `media_pipeline.DiarizedTranscript` instead of a DAIC-WOZ transcript CSV.
   Column order verified against `friend_shared_work/_inspected_metadata/model2_audio.json`.
   Note: despite the model file being named `audio_covarep.joblib`, it does
   not actually use MFCCs, spectral shape features, or real COVAREP data —
   confirmed by matching the shipped model's column list against the source,
   not the filename.

`USE_REAL_MODELS=true` now runs genuine end-to-end predictions.

## Still worth double-checking with your friend

These are real assumptions this project made where the source didn't fully
resolve the ambiguity — not implementation bugs, but worth confirming if
predictions look off in practice:

- **Participant identification**: `media_pipeline.identify_participant_speaker()`
  assumes the participant is whichever diarized speaker talks more overall.
  Confirm this matches how your friend's team defined "participant" in
  training, or provide a better signal if you have one (e.g. a fixed
  question/answer turn order).
- **Response-latency definition**: this project measures it from the
  counselor's diarized *segment end* to the participant's segment start
  (`audio_features.py`'s `_timing_features`). The original DAIC-WOZ transcript
  encodes the same thing at the row level, so this should match — but if
  results look off, compare against measuring from the counselor's *last
  word* instead (`transcript.words` has per-word timestamps for this).
- **"Utterance" granularity**: the original script's utterances are DAIC-WOZ
  transcript rows (each a manually segmented turn). This project's
  "utterances" are diarization+Whisper segments (each a continuous same-speaker
  stretch) — the closest available analog, but not guaranteed to segment
  identically to the original transcripts (e.g. Whisper may merge two closely
  spaced sentences the original transcript kept as separate rows).
