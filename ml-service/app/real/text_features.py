"""
Turns the participant's speech into the 3,096-number vector text_honest.joblib
expects: 24 hand-counted language-habit features + 3,072 sentence-meaning
numbers from all-mpnet-base-v2 (4 pooling stats x 768 dims).

Ported from the research project's src/extract_text_features.py, provided by
the friend who trained the models (Friends_Work/src/extract_text_features.py
and Friends_Work/src/common.py). Column names, lexicons, and the embedding
pooling order (mean, weighted mean, max, std) are copied as-is so the
resulting vector matches ml-service/models/text_honest.joblib's "cols" key
exactly (see friend_shared_work/_inspected_metadata/model1_text.json).

DAIC-WOZ transcript rows -> our diarized Segments: the original script reads
one row per participant utterance from a transcript CSV. Our
media_pipeline.py produces the equivalent from real diarization: each
Segment is one continuous participant speaker turn, used here as one
"utterance" -- the closest available analog.
"""

from __future__ import annotations

import re
import threading
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from app.real.media_pipeline import Segment

EXPECTED_FEATURE_COUNT = 3096
EMBED_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
EMBED_DIM = 768
EMBED_MAX_LEN = 64
EMBED_BATCH = 64

# --------------------------------------------------------------------------
# Ported verbatim from Friends_Work/src/common.py
# --------------------------------------------------------------------------
FILLER_ONLY = {
    "", "um", "uh", "mhm", "mm", "hmm", "mm-hmm", "uh-huh", "huh", "yeah", "yep",
    "okay", "ok", "<laughter>", "<sigh>", "xxx",
}

# --------------------------------------------------------------------------
# Ported verbatim from Friends_Work/src/extract_text_features.py
# --------------------------------------------------------------------------
FIRST_SG = {"i", "me", "my", "mine", "myself", "i'm", "i've", "i'll", "i'd"}
FIRST_PL = {"we", "us", "our", "ours", "ourselves", "we're", "we've"}
SECOND = {"you", "your", "yours", "yourself", "you're", "you've"}
THIRD = {"he", "she", "they", "him", "her", "them", "his", "their", "theirs"}
ABSOLUTIST = {"absolutely", "all", "always", "complete", "completely", "constant",
              "constantly", "definitely", "entire", "ever", "every", "everyone",
              "everything", "full", "must", "never", "nothing", "nobody", "totally",
              "total", "whole", "no one", "none"}
NEGATIVE = {"sad", "depressed", "depression", "anxious", "anxiety", "angry", "anger",
            "afraid", "scared", "fear", "worried", "worry", "stress", "stressed",
            "lonely", "alone", "hurt", "pain", "painful", "cry", "crying", "tired",
            "exhausted", "hate", "bad", "worse", "worst", "terrible", "awful",
            "horrible", "upset", "guilt", "guilty", "ashamed", "shame", "hopeless",
            "useless", "worthless", "failure", "fail", "failed", "struggle",
            "struggling", "difficult", "hard", "trouble", "problem", "problems",
            "suicide", "die", "death", "dead", "kill", "ptsd", "trauma", "nightmare"}
POSITIVE = {"happy", "happiness", "good", "great", "love", "loved", "loving", "enjoy",
            "enjoyed", "fun", "excited", "exciting", "glad", "wonderful", "amazing",
            "awesome", "nice", "better", "best", "proud", "hope", "hopeful", "grateful",
            "thankful", "relax", "relaxed", "calm", "peace", "peaceful", "smile",
            "laugh", "laughing", "friend", "friends", "family"}
NEGATION = {"not", "no", "never", "none", "nobody", "nothing", "neither", "nor",
            "cannot", "can't", "won't", "don't", "doesn't", "didn't", "isn't",
            "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "wouldn't",
            "shouldn't", "couldn't", "ain't"}
HEDGE = {"maybe", "perhaps", "probably", "possibly", "sort", "kind", "guess",
         "think", "sometimes", "somewhat", "little", "bit"}
PAST = {"was", "were", "had", "did", "used", "ago", "before", "back", "then",
        "yesterday", "previously", "once"}
SLEEP_FATIGUE = {"sleep", "sleeping", "asleep", "insomnia", "tired", "exhausted",
                 "fatigue", "rest", "nap", "awake", "bed", "energy"}

# Exact order from friend_shared_work/_inspected_metadata/model1_text.json "cols"[:24]
LEX_COLS = [
    "lex_n_words", "lex_n_utts", "lex_words_per_utt", "lex_words_per_utt_std",
    "lex_median_utt_len", "lex_type_token_ratio", "lex_root_ttr", "lex_mean_word_len",
    "lex_first_singular", "lex_first_plural", "lex_second_person", "lex_third_person",
    "lex_absolutist", "lex_negative", "lex_positive", "lex_negation", "lex_hedge",
    "lex_past_tense", "lex_sleep_fatigue", "lex_self_focus_ratio", "lex_neg_pos_ratio",
    "lex_sentiment_balance", "lex_short_answer_rate", "lex_long_answer_rate",
]


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z']+", text.lower())


def _lexical_features(texts: list[str]) -> dict[str, float]:
    """Ported from extract_text_features.py's lexical_features(), adapted from a
    DataFrame of utterances to a plain list of utterance strings."""
    all_text = " ".join(texts)
    toks = _tokenize(all_text)
    n = max(len(toks), 1)
    counts: dict[str, int] = {}
    for t in toks:
        counts[t] = counts.get(t, 0) + 1

    def rate(vocab) -> float:
        return float(sum(counts.get(w, 0) for w in vocab)) / n * 100.0

    lens = np.array([len(_tokenize(t)) for t in texts], dtype=float)
    lens = lens[lens > 0]
    uniq = len(set(toks))

    out = {
        "lex_n_words": float(len(toks)),
        "lex_n_utts": float(len(texts)),
        "lex_words_per_utt": float(lens.mean()) if lens.size else 0.0,
        "lex_words_per_utt_std": float(lens.std()) if lens.size else 0.0,
        "lex_median_utt_len": float(np.median(lens)) if lens.size else 0.0,
        "lex_type_token_ratio": uniq / n,
        "lex_root_ttr": uniq / np.sqrt(n),
        "lex_mean_word_len": float(np.mean([len(w) for w in toks])) if toks else 0.0,
        "lex_first_singular": rate(FIRST_SG),
        "lex_first_plural": rate(FIRST_PL),
        "lex_second_person": rate(SECOND),
        "lex_third_person": rate(THIRD),
        "lex_absolutist": rate(ABSOLUTIST),
        "lex_negative": rate(NEGATIVE),
        "lex_positive": rate(POSITIVE),
        "lex_negation": rate(NEGATION),
        "lex_hedge": rate(HEDGE),
        "lex_past_tense": rate(PAST),
        "lex_sleep_fatigue": rate(SLEEP_FATIGUE),
    }
    out["lex_self_focus_ratio"] = out["lex_first_singular"] / max(out["lex_first_plural"] + out["lex_third_person"], 0.01)
    out["lex_neg_pos_ratio"] = out["lex_negative"] / max(out["lex_positive"], 0.01)
    out["lex_sentiment_balance"] = out["lex_positive"] - out["lex_negative"]
    out["lex_short_answer_rate"] = float((lens <= 3).mean()) if lens.size else 0.0
    out["lex_long_answer_rate"] = float((lens >= 30).mean()) if lens.size else 0.0
    return out


# --------------------------------------------------------------------------
# Sentence embedding model -- lazy singleton, loaded once (mirrors model_loader.py)
# --------------------------------------------------------------------------
_embed_lock = threading.Lock()
_tokenizer = None
_embed_model = None
_device = None


def _get_embed_model():
    global _tokenizer, _embed_model, _device
    if _embed_model is None:
        with _embed_lock:
            if _embed_model is None:
                import torch
                from transformers import AutoModel, AutoTokenizer

                _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                _tokenizer = AutoTokenizer.from_pretrained(EMBED_MODEL_NAME)
                _embed_model = AutoModel.from_pretrained(EMBED_MODEL_NAME).to(_device).eval()
    return _tokenizer, _embed_model, _device


def _embed_sentences(sentences: list[str]) -> np.ndarray:
    """Mask-aware mean pooling per sentence -- ported from embed_utterances()."""
    import torch

    tok, model, device = _get_embed_model()
    vecs = []
    with torch.no_grad():
        for i in range(0, len(sentences), EMBED_BATCH):
            batch = sentences[i:i + EMBED_BATCH]
            enc = tok(batch, padding=True, truncation=True, max_length=EMBED_MAX_LEN,
                      return_tensors="pt").to(device)
            out = model(**enc).last_hidden_state
            m = enc["attention_mask"].unsqueeze(-1).to(out.dtype)
            v = (out * m).sum(1) / m.sum(1).clamp(min=1e-6)
            vecs.append(v.float().cpu().numpy())
    return np.concatenate(vecs, 0)


def _mpnet_features(filler_dropped_texts: list[str]) -> np.ndarray:
    """[mean, length-weighted mean, max, std] of per-sentence mpnet vectors --
    the exact aggregation order embed_utterances() concatenates in."""
    sents = filler_dropped_texts if filler_dropped_texts else [""]
    V = _embed_sentences(sents)  # (n_sentences, 768)
    w = np.array([max(len(s.split()), 1) for s in sents], dtype=np.float64)
    w = w / w.sum()
    return np.concatenate([V.mean(0), (V * w[:, None]).sum(0), V.max(0), V.std(0)]).astype(np.float64)


def compute_text_features(participant_segments: list["Segment"]) -> np.ndarray:
    if not participant_segments:
        raise ValueError(
            "No participant speech segments to extract text features from -- "
            "this means diarization/transcription upstream produced nothing usable."
        )

    cleaned = [_clean(seg.text) for seg in participant_segments]
    cleaned = [c for c in cleaned if c]

    lex = _lexical_features(cleaned)
    lex_vec = np.array([lex[k] for k in LEX_COLS], dtype=np.float64)

    filler_dropped = [c for c in cleaned if c.lower() not in FILLER_ONLY]
    mpnet_vec = _mpnet_features(filler_dropped)

    vec = np.concatenate([lex_vec, mpnet_vec])
    assert vec.shape[0] == EXPECTED_FEATURE_COUNT, (
        f"text feature vector has {vec.shape[0]} entries, expected {EXPECTED_FEATURE_COUNT}"
    )
    return vec
