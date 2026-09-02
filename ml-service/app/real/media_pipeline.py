"""
Turns an uploaded interview video into speaker-separated, word-timestamped
speech — the input the feature extractors need.

    video.mp4
        |
        v  ffmpeg
    audio.wav (16kHz mono)
        |
        v  faster-whisper
    words with timestamps + full transcript
        |
        v  pyannote.audio
    speaker segments (who spoke when)
        |
        v  merge + voiceprint matching
    participant-only words/segments  (+ counselor and companion, for the record)

Recordings capture everyone in the room, but the models were trained on the
PARTICIPANT's speech only, so deciding which diarized cluster is the
participant decides whose mental health gets scored.

That decision used to be a heuristic — the participant is whoever talks most —
carried over from DAIC-WOZ, where the interviewer is a virtual agent asking
short scripted questions. It has been removed. In a real counselling room a
withdrawn client answers in single words while the counselor carries the
conversation, so the heuristic would hand the counselor's voice to the model
and produce a confident, normal-looking report about the wrong person, most
often for the people the tool exists to help.

Speakers are now identified positively against enrolled voiceprints: the
counselor enrols by reading a passage, anyone else in the room reads it before
the interview, and the participant is whoever matches none of them. When that
does not resolve cleanly the session is not scored. See voiceprint.py.
"""

import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# The "shared" build (not "essentials") is required: torchcodec (pulled in by
# pyannote's newer diarization pipeline) dynamically loads FFmpeg's shared
# libraries (avcodec-*.dll etc.) at runtime, which the static essentials
# build doesn't ship.
_FFMPEG_BIN_DIR = Path(__file__).resolve().parent.parent.parent / "tools" / "ffmpeg-9.0.1-full_build-shared" / "bin"
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", str(_FFMPEG_BIN_DIR / "ffmpeg.exe"))

# Put ffmpeg's DLL directory on the search path so torchcodec's native
# extension can find avcodec/avformat/avutil/etc. at import time.
if sys.platform == "win32" and _FFMPEG_BIN_DIR.exists():
    os.add_dll_directory(str(_FFMPEG_BIN_DIR))
    os.environ["PATH"] = str(_FFMPEG_BIN_DIR) + os.pathsep + os.environ.get("PATH", "")
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
HF_TOKEN = os.environ.get("HF_TOKEN")


class SpeakerResolutionError(Exception):
    """
    The people in a recording could not be matched to the enrolled voices.

    Deliberately its own type rather than a RuntimeError: this is not a
    malfunction, it is the pipeline declining to guess. real_inference maps it
    to a distinct outcome so the counselor is told what to check, instead of
    seeing a generic processing failure for a recording that is probably fine.
    """


@dataclass
class Word:
    text: str
    start: float
    end: float
    speaker: str | None = None


@dataclass
class Segment:
    speaker: str
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)


@dataclass
class DiarizedTranscript:
    full_text: str
    words: list[Word]
    segments: list[Segment]
    participant_speaker: str
    counselor_speaker: str | None
    participant_segments: list[Segment]
    counselor_segments: list[Segment]
    wav_path: str
    """Caller (real_inference.py) is responsible for deleting this once the
    audio feature extractor is done reading it — kept alive here because
    prosody/pitch analysis needs the raw audio, not just the transcript."""

    # Diarized labels matched to companions enrolled at session start, and the
    # full similarity matrix behind every assignment. Both are surfaced on the
    # report: "the counselor was identified at 0.81 similarity" is auditable in
    # a way that "trust me" is not. Defaulted, so they must stay last.
    companion_speakers: list[str] = field(default_factory=list)
    speaker_similarities: dict = field(default_factory=dict)


def extract_audio(video_path: str) -> str:
    """ffmpeg: pull a 16kHz mono WAV out of the uploaded video. Returns the wav path."""
    if not Path(FFMPEG_PATH).exists():
        raise RuntimeError(
            f"ffmpeg not found at {FFMPEG_PATH}. Set FFMPEG_PATH or see README "
            f"for how ffmpeg was installed for this project."
        )

    wav_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    result = subprocess.run(
        [FFMPEG_PATH, "-y", "-i", video_path, "-ac", "1", "-ar", "16000", "-vn", wav_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed to extract audio: {result.stderr[-2000:]}")
    return wav_path


def transcribe_with_timestamps(wav_path: str, language: str = "en") -> tuple[str, list[Word]]:
    """
    faster-whisper: transcript + word-level timestamps (no speaker info yet).

    The language is passed explicitly rather than left to Whisper's
    auto-detection. Auto-detection decides from the first ~30 seconds, which in
    a counselling session is small talk, and it copes badly with code-switching
    — a Hinglish opening can be detected as either language, so the same
    recording could transcribe differently on two runs. The counselor selects
    the language when creating the session; that answer is more reliable than
    a guess, and it makes the transcript reproducible.
    """
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(wav_path, word_timestamps=True, language=language)

    words: list[Word] = []
    full_text_parts: list[str] = []
    for seg in segments:
        full_text_parts.append(seg.text.strip())
        for w in seg.words or []:
            words.append(Word(text=w.word.strip(), start=w.start, end=w.end))

    return " ".join(full_text_parts).strip(), words


_DIARIZATION_PIPELINE = None


def _load_diarization_pipeline():
    """
    The diarization pipeline, loaded once and reused.

    Cached because it is now run for voiceprint enrollment as well as for
    sessions, and re-reading several hundred megabytes of weights on every
    enrollment would dominate the wait. The cache also matters for
    correctness: enrollment and session embeddings must come from the same
    model instance's vector space to be comparable at all.
    """
    global _DIARIZATION_PIPELINE
    if _DIARIZATION_PIPELINE is not None:
        return _DIARIZATION_PIPELINE

    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN is not set. Diarization needs a free Hugging Face account: "
            "accept the terms for 'pyannote/speaker-diarization-community-1' and "
            "generate an access token, then set HF_TOKEN. See README 'Real model "
            "integration' section for the full setup steps."
        )

    from pyannote.audio import Pipeline

    _DIARIZATION_PIPELINE = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-community-1", token=HF_TOKEN
    )
    return _DIARIZATION_PIPELINE


def diarize_with_embeddings(wav_path: str):
    """
    Who spoke when, plus one voice embedding per speaker.

    Returns (labels, embeddings, turns) where `embeddings[i]` belongs to
    `labels[i]`. pyannote guarantees that row ordering matches
    `diarization.labels()`, which is what lets a speaker be matched against an
    enrolled voiceprint — see voiceprint.py.

    Embeddings are None on pipeline versions that do not expose them (the
    older API returned a bare Annotation). Callers must handle that rather
    than assume: without embeddings there is no voice matching, and the
    session must be refused rather than silently fall back to guessing which
    speaker is the participant.
    """
    pipeline = _load_diarization_pipeline()
    result = pipeline(wav_path)

    # Newer pipeline versions wrap the Annotation in a result object
    # (result.speaker_diarization); older ones return the Annotation
    # directly. Handle both without guessing which one is installed.
    annotation = getattr(result, "speaker_diarization", result)
    embeddings = getattr(result, "speaker_embeddings", None)

    turns = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        turns.append((turn.start, turn.end, speaker))

    return list(annotation.labels()), embeddings, turns


def diarize(wav_path: str) -> list[tuple[float, float, str]]:
    """
    pyannote.audio: who spoke when, as (start, end, speaker_label) tuples.
    Requires HF_TOKEN — see README "Real model integration" section.

    Uses "pyannote/speaker-diarization-community-1", the newer pipeline that
    speaker-diarization-3.1 itself now depends on internally (and which
    pyannote's own model card describes as more accurate) — using it
    directly avoids needing two separate gated-model approvals for the same
    underlying dependency.
    """
    pipeline = _load_diarization_pipeline()
    result = pipeline(wav_path)

    annotation = getattr(result, "speaker_diarization", result)

    turns = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        turns.append((turn.start, turn.end, speaker))
    return turns


def _assign_speakers_to_words(words: list[Word], turns: list[tuple[float, float, str]]) -> None:
    """For each word, pick the diarized speaker turn it overlaps most with."""
    for word in words:
        best_speaker, best_overlap = None, 0.0
        for start, end, speaker in turns:
            overlap = min(word.end, end) - max(word.start, start)
            if overlap > best_overlap:
                best_overlap, best_speaker = overlap, speaker
        word.speaker = best_speaker or "UNKNOWN"


def _group_into_segments(words: list[Word]) -> list[Segment]:
    """Consecutive same-speaker words become one segment."""
    segments: list[Segment] = []
    for word in words:
        if segments and segments[-1].speaker == word.speaker:
            seg = segments[-1]
            seg.end = word.end
            seg.text = (seg.text + " " + word.text).strip()
            seg.words.append(word)
        else:
            segments.append(Segment(speaker=word.speaker, start=word.start, end=word.end, text=word.text, words=[word]))
    return segments


def process_video(
    video_path: str,
    language: str = "en",
    counselor_embedding=None,
    companion_embeddings=None,
) -> DiarizedTranscript:
    """
    Full pipeline: video -> audio -> transcript+timestamps -> diarization ->
    voiceprint matching -> participant isolation. Does NOT delete the extracted
    wav file — the returned DiarizedTranscript.wav_path is still needed for
    audio prosody features; call cleanup_wav() once you're done with it.

    `counselor_embedding` is required. There is deliberately no path through
    this function that guesses who the participant is: a caller without an
    enrolled voiceprint has nothing to identify anyone with, and producing a
    prediction anyway is the failure this module was rewritten to prevent.

    Raises SpeakerResolutionError when the voices in the recording cannot be
    matched to exactly one unidentified participant.
    """
    from app.real.voiceprint import resolve_speakers

    if counselor_embedding is None:
        raise SpeakerResolutionError(
            "No counselor voiceprint was supplied, so there is no way to tell which "
            "voice in this recording belongs to the participant."
        )

    wav_path = extract_audio(video_path)
    try:
        full_text, words = transcribe_with_timestamps(wav_path, language=language)
        labels, embeddings, turns = diarize_with_embeddings(wav_path)

        if embeddings is None:
            raise SpeakerResolutionError(
                "The installed diarization pipeline did not return speaker embeddings, "
                "so voices cannot be matched against enrolled voiceprints."
            )

        roles = resolve_speakers(labels, embeddings, counselor_embedding, companion_embeddings)
        if not roles.resolved:
            raise SpeakerResolutionError(roles.reason)

        _assign_speakers_to_words(words, turns)
        segments = _group_into_segments(words)

        participant_segments = [s for s in segments if s.speaker == roles.participant]
        counselor_segments = [s for s in segments if s.speaker == roles.counselor]

        return DiarizedTranscript(
            full_text=full_text,
            words=words,
            segments=segments,
            participant_speaker=roles.participant,
            counselor_speaker=roles.counselor,
            participant_segments=participant_segments,
            counselor_segments=counselor_segments,
            companion_speakers=roles.companions,
            speaker_similarities=roles.similarities,
            wav_path=wav_path,
        )
    except Exception:
        cleanup_wav(wav_path)
        raise


def cleanup_wav(wav_path: str) -> None:
    try:
        os.remove(wav_path)
    except OSError:
        pass
