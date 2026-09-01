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
        v  merge + heuristic
    participant-only words/segments  (+ counselor-only, kept for reference)

IMPORTANT ASSUMPTION (documented, not hidden): recordings capture both the
counselor and the participant (confirmed for this project), but the models
were trained on the PARTICIPANT's speech only. After diarization produces
two speaker clusters, this module assumes the participant is whichever
speaker has more total speaking time across the session — typical for an
interview where the counselor mostly asks short questions and the
participant answers at length. If real recordings don't fit that pattern,
this heuristic (identify_participant_speaker below) is the one place to
revisit.
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


def transcribe_with_timestamps(wav_path: str) -> tuple[str, list[Word]]:
    """faster-whisper: transcript + word-level timestamps (no speaker info yet)."""
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(wav_path, word_timestamps=True)

    words: list[Word] = []
    full_text_parts: list[str] = []
    for seg in segments:
        full_text_parts.append(seg.text.strip())
        for w in seg.words or []:
            words.append(Word(text=w.word.strip(), start=w.start, end=w.end))

    return " ".join(full_text_parts).strip(), words


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
    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN is not set. Diarization needs a free Hugging Face account: "
            "accept the terms for 'pyannote/speaker-diarization-community-1' and "
            "generate an access token, then set HF_TOKEN. See README 'Real model "
            "integration' section for the full setup steps."
        )

    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=HF_TOKEN)
    result = pipeline(wav_path)

    # Newer pipeline versions wrap the Annotation in a result object
    # (result.speaker_diarization); older ones return the Annotation
    # directly. Handle both without guessing which one is installed.
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


def identify_participant_speaker(segments: list[Segment]) -> tuple[str, str | None]:
    """
    Heuristic (documented in this module's docstring): the participant is the
    speaker with more total speaking time. Returns (participant, counselor)
    speaker labels. If only one speaker was detected, that speaker is treated
    as the participant and there is no counselor.
    """
    totals: dict[str, float] = {}
    for seg in segments:
        totals[seg.speaker] = totals.get(seg.speaker, 0.0) + (seg.end - seg.start)

    if not totals:
        raise RuntimeError("No speech detected in this recording.")

    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    participant = ranked[0][0]
    counselor = ranked[1][0] if len(ranked) > 1 else None
    return participant, counselor


def process_video(video_path: str) -> DiarizedTranscript:
    """
    Full pipeline: video -> audio -> transcript+timestamps -> diarization ->
    participant isolation. Does NOT delete the extracted wav file — the
    returned DiarizedTranscript.wav_path is still needed for audio prosody
    features; call cleanup_wav() once you're done with it.
    """
    wav_path = extract_audio(video_path)
    try:
        full_text, words = transcribe_with_timestamps(wav_path)
        turns = diarize(wav_path)
        _assign_speakers_to_words(words, turns)
        segments = _group_into_segments(words)
        participant_speaker, counselor_speaker = identify_participant_speaker(segments)

        participant_segments = [s for s in segments if s.speaker == participant_speaker]
        counselor_segments = [s for s in segments if s.speaker == counselor_speaker] if counselor_speaker else []

        return DiarizedTranscript(
            full_text=full_text,
            words=words,
            segments=segments,
            participant_speaker=participant_speaker,
            counselor_speaker=counselor_speaker,
            participant_segments=participant_segments,
            counselor_segments=counselor_segments,
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
