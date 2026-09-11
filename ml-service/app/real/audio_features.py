"""
Turns the diarized audio + transcript into the 85-number vector
audio_covarep.joblib expects: speaking-rhythm/timing features (utterance
duration, response latency, pauses) plus pitch/loudness prosody (YIN-based
pitch, loudness variation).

Ported from the research project's src/extract_audio_features_v2.py, provided
by the friend who trained the models (Friends_Work/src/extract_audio_features_v2.py).
Only the specific subset of that script's output actually used by the shipped
model is computed here -- confirmed column-by-column, in order, against
friend_shared_work/_inspected_metadata/model2_audio.json's "cols" key. Notably
the model does NOT use MFCCs, spectral centroid/bandwidth/rolloff/flatness/zcr,
or real COVAREP data, despite the file being named audio_covarep.joblib --
that name is a leftover from the research project's iteration; the real
column list is what's implemented here.

DAIC-WOZ transcript rows -> our diarized Segments: the original script reads
one row per utterance from a transcript CSV with "ellie"/"participant"
speaker labels. Our media_pipeline.py produces the equivalent from real
diarization: transcript.segments (the full chronological, both-speaker
sequence -- needed to detect counselor-to-participant turn transitions for
response latency) and transcript.participant_segments (pre-filtered,
still time-ordered).
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from app.real.media_pipeline import DiarizedTranscript

logger = logging.getLogger(__name__)

EXPECTED_FEATURE_COUNT = 85
SR = 16000
HOP = 160          # 10 ms frames
FMIN, FMAX = 65.0, 400.0

# Exact order from friend_shared_work/_inspected_metadata/model2_audio.json "cols"
AUDIO_COLS = [
    "utt_duration_mean", "utt_duration_std", "utt_duration_p10", "utt_duration_p25",
    "utt_duration_p50", "utt_duration_p75", "utt_duration_p90", "utt_duration_iqr",
    "utt_duration_slope",
    "utt_words_mean", "utt_words_std", "utt_words_p10", "utt_words_p25",
    "utt_words_p50", "utt_words_p75", "utt_words_p90", "utt_words_iqr",
    "utt_words_slope",
    "total_speech_s", "session_len_s", "speech_ratio", "n_utterances", "total_words",
    "words_per_second", "utts_per_minute",
    "between_turn_gap_mean", "between_turn_gap_std", "between_turn_gap_p10",
    "between_turn_gap_p25", "between_turn_gap_p50", "between_turn_gap_p75",
    "between_turn_gap_p90", "between_turn_gap_iqr", "between_turn_gap_slope",
    "long_pause_rate",
    "response_latency_mean", "response_latency_std", "response_latency_p10",
    "response_latency_p25", "response_latency_p50", "response_latency_p75",
    "response_latency_p90", "response_latency_iqr", "response_latency_slope",
    "n_responses", "slow_response_rate",
    "spec_rms_db_mean", "spec_rms_db_std", "spec_rms_db_p10", "spec_rms_db_p25",
    "spec_rms_db_p50", "spec_rms_db_p75", "spec_rms_db_p90", "spec_rms_db_iqr",
    "spec_rms_db_slope",
    "rms_db_range", "voiced_ratio",
    "f0_semitone_mean", "f0_semitone_std", "f0_semitone_p10", "f0_semitone_p25",
    "f0_semitone_p50", "f0_semitone_p75", "f0_semitone_p90", "f0_semitone_iqr",
    "f0_semitone_slope",
    "f0_range_semitones",
    "f0_jitter_mean", "f0_jitter_std", "f0_jitter_p10", "f0_jitter_p25",
    "f0_jitter_p50", "f0_jitter_p75", "f0_jitter_p90", "f0_jitter_iqr",
    "f0_jitter_slope",
    "amp_shimmer_mean", "amp_shimmer_std", "amp_shimmer_p10", "amp_shimmer_p25",
    "amp_shimmer_p50", "amp_shimmer_p75", "amp_shimmer_p90", "amp_shimmer_iqr",
    "amp_shimmer_slope",
]
assert len(AUDIO_COLS) == EXPECTED_FEATURE_COUNT

# Three timing features re-derived from the PARTICIPANT's turns alone, used by
# the models trained on the official DAIC-WOZ release (My_Work, "clean-64").
#
# That training run dropped 24 of the 85 columns above because they depend on
# the interviewer: response latency is measured from the end of the
# interviewer's question, and session length and the gaps between turns span
# the interviewer's speech. On DAIC-WOZ the interviewer was a scripted virtual
# agent, so those timings describe the protocol as much as the person — and
# they change completely when a human counsellor asks the questions. These
# three keep what was salvageable, measured from the first thing the
# participant said to the last.
PARTICIPANT_ONLY_COLS = ["session_len_s_pt", "speech_ratio_pt", "utts_per_minute_pt"]

# Every named audio feature this module can produce. A model may use any
# subset, in any order — its own "cols" list decides; see feature_space.py.
ALL_AUDIO_COLS = AUDIO_COLS + PARTICIPANT_ONLY_COLS


def _clean_words(text: str) -> int:
    return len(re.sub(r"<[^>]*>", " ", text).split())


def _functionals(x, name: str) -> dict[str, float]:
    """Ported verbatim from extract_audio_features_v2.py."""
    x = np.asarray(x, dtype=np.float64)
    x = x[np.isfinite(x)]
    keys = ("mean", "std", "p10", "p25", "p50", "p75", "p90", "iqr", "slope")
    if x.size < 5:
        return {f"{name}_{k}": 0.0 for k in keys}
    from scipy.stats import linregress
    p10, p25, p50, p75, p90 = np.percentile(x, [10, 25, 50, 75, 90])
    try:
        slope = float(linregress(np.arange(x.size), x).slope)
    except Exception:
        slope = 0.0
    return {f"{name}_mean": float(x.mean()), f"{name}_std": float(x.std()),
            f"{name}_p10": float(p10), f"{name}_p25": float(p25), f"{name}_p50": float(p50),
            f"{name}_p75": float(p75), f"{name}_p90": float(p90),
            f"{name}_iqr": float(p75 - p25), f"{name}_slope": slope}


def _timing_features(transcript: "DiarizedTranscript") -> dict[str, float]:
    p = transcript.participant_segments
    out: dict[str, float] = {}
    if not p:
        return out

    dur = np.array([s.end - s.start for s in p], dtype=np.float64)
    total_speech = float(np.clip(dur, 0, None).sum())
    all_segs = transcript.segments
    session_len = float(max(s.end for s in all_segs) - min(s.start for s in all_segs)) if all_segs else 0.0
    words = np.array([_clean_words(s.text) for s in p], dtype=np.float64)

    out.update(_functionals(dur, "utt_duration"))
    out.update(_functionals(words, "utt_words"))
    out["total_speech_s"] = total_speech
    out["session_len_s"] = session_len
    out["speech_ratio"] = total_speech / session_len if session_len > 0 else 0.0
    out["n_utterances"] = float(len(p))
    out["total_words"] = float(words.sum())
    out["words_per_second"] = words.sum() / total_speech if total_speech > 0 else 0.0
    out["utts_per_minute"] = 60.0 * len(p) / session_len if session_len > 0 else 0.0

    if len(p) > 1:
        starts = np.array([s.start for s in p])
        stops = np.array([s.end for s in p])
        gaps = starts[1:] - stops[:-1]
        gaps = gaps[(gaps >= 0) & (gaps < 120)]
        out.update(_functionals(gaps, "between_turn_gap"))
        out["long_pause_rate"] = float((gaps > 2.0).mean()) if gaps.size else 0.0

    lat = []
    for i in range(len(all_segs) - 1):
        if (all_segs[i].speaker == transcript.counselor_speaker
                and all_segs[i + 1].speaker == transcript.participant_speaker):
            d = all_segs[i + 1].start - all_segs[i].end
            if 0 <= d < 60:
                lat.append(d)
    if lat:
        out.update(_functionals(np.array(lat), "response_latency"))
        out["n_responses"] = float(len(lat))
        out["slow_response_rate"] = float((np.array(lat) > 1.5).mean())
    return out


def _acoustic_features(wav_path: str, transcript: "DiarizedTranscript") -> dict[str, float]:
    import librosa

    p = transcript.participant_segments
    if not p:
        return {}

    y, _ = librosa.load(wav_path, sr=SR, mono=True)

    n_frames = int(len(y) / HOP) + 1
    mask = np.zeros(n_frames, dtype=bool)
    for s in p:
        a, b = int(s.start * 100), min(int(s.end * 100), n_frames)
        if b > a:
            mask[a:b] = True
    if mask.sum() < 50:
        return {}

    out: dict[str, float] = {}

    rms = librosa.feature.rms(y=y, hop_length=HOP, frame_length=400)[0]
    nf = min(len(mask), len(rms))
    m = mask[:nf]
    rms_db = 20 * np.log10(np.maximum(rms[:nf][m], 1e-8))
    out.update(_functionals(rms_db, "spec_rms_db"))
    out["rms_db_range"] = float(np.percentile(rms_db, 95) - np.percentile(rms_db, 5)) if rms_db.size else 0.0

    speech = np.concatenate([y[int(s.start * SR):int(s.end * SR)]
                             for s in p if int(s.end * SR) > int(s.start * SR)]) \
        if p else np.array([], dtype=np.float32)
    if speech.size > SR:
        f0 = librosa.yin(speech, fmin=FMIN, fmax=FMAX, sr=SR, frame_length=1024, hop_length=256)
        e = librosa.feature.rms(y=speech, frame_length=1024, hop_length=256)[0]
        n = min(len(f0), len(e))
        f0, e = f0[:n], e[:n]
        voiced = (e > np.percentile(e, 35)) & (f0 > FMIN * 1.02) & (f0 < FMAX * 0.98)
        out["voiced_ratio"] = float(voiced.mean())
        if voiced.sum() > 20:
            st = 12 * np.log2(f0[voiced] / 100.0)
            out.update(_functionals(st, "f0_semitone"))
            out["f0_range_semitones"] = float(np.percentile(st, 95) - np.percentile(st, 5))
            out.update(_functionals(np.abs(np.diff(st)), "f0_jitter"))
            ed = 20 * np.log10(np.maximum(e[voiced], 1e-8))
            out.update(_functionals(np.abs(np.diff(ed)), "amp_shimmer"))
    return out


def _participant_only_timing(transcript: "DiarizedTranscript") -> dict[str, float]:
    """
    Ported from My_Work/training_scripts/extract_canonical.py,
    participant_only_timing(). Never references a counsellor segment.
    """
    p = transcript.participant_segments
    if not p:
        return {"session_len_s_pt": 0.0, "speech_ratio_pt": 0.0, "utts_per_minute_pt": 0.0}
    span = float(max(s.end for s in p) - min(s.start for s in p))
    speech = float(np.clip(np.array([s.end - s.start for s in p], dtype=np.float64), 0, None).sum())
    return {
        "session_len_s_pt": span,
        "speech_ratio_pt": speech / span if span > 0 else 0.0,
        "utts_per_minute_pt": 60.0 * len(p) / span if span > 0 else 0.0,
    }


def compute_audio_feature_map(wav_path: str, transcript: "DiarizedTranscript") -> dict[str, float]:
    """
    Every audio feature this session yields, by name.

    A feature that could not be measured — too little voiced speech for a pitch
    estimate, say — is ABSENT rather than zero. The DAIC-WOZ models were
    trained with such gaps left empty for their own imputer to fill with the
    training median, and a zero would be a real measurement of "no pitch at all".
    """
    if not transcript.participant_segments:
        raise ValueError(
            "No participant speech segments to extract audio features from -- "
            "this means diarization/transcription upstream produced nothing usable."
        )

    combined: dict[str, float] = {}
    combined.update(_timing_features(transcript))
    combined.update(_acoustic_features(wav_path, transcript))
    combined.update(_participant_only_timing(transcript))
    return combined


def compute_audio_features(wav_path: str, transcript: "DiarizedTranscript") -> np.ndarray:
    """
    The original 85-column vector, which is what the session record stores.

    Kept at 85 whatever model is serving, so every stored row has the same
    shape and the research export does not change meaning between sessions.
    Prediction does not use this: it builds each model's input from the named
    map instead, in that model's own column order.
    """
    return legacy_audio_vector(compute_audio_feature_map(wav_path, transcript))


def legacy_audio_vector(combined: dict[str, float]) -> np.ndarray:
    missing = [c for c in AUDIO_COLS if c not in combined]
    if missing:
        logger.warning(
            "audio feature extraction: %d/%d columns missing (too little speech or "
            "voiced audio for this session) -- filled with 0.0: %s",
            len(missing), EXPECTED_FEATURE_COUNT, missing,
        )

    vec = np.array([combined.get(c, 0.0) for c in AUDIO_COLS], dtype=np.float64)
    assert vec.shape[0] == EXPECTED_FEATURE_COUNT, (
        f"audio feature vector has {vec.shape[0]} entries, expected {EXPECTED_FEATURE_COUNT}"
    )
    return vec
