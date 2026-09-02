from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    session_id: str
    video_path: str
    # BCP-47 code chosen by the counselor when the session was created. Defaults
    # to English so an older backend that doesn't send it keeps working, and so
    # the default is the one language actually validated end to end.
    language: str = "en"

    # The counselor's enrolled voiceprint, and one per other person who was in
    # the room. Required in practice: without the counselor's, the pipeline
    # cannot tell which voice belongs to the participant and refuses to score
    # rather than guess. Optional in the schema only so the failure is a clear
    # 422 from the pipeline instead of a validation error the counselor cannot
    # act on. See app/real/voiceprint.py.
    counselor_embedding: Optional[List[float]] = None
    companion_embeddings: Optional[List[List[float]]] = None


class ExplanationItem(BaseModel):
    feature_name: str
    contribution_score: float
    description: str
    # Which modality pipeline this feature came from. Video is deliberately
    # excluded here (see app/modalities/video.py) — it only contributes at
    # the coarse modality_contributions level, not as named sub-features.
    modality: Literal["audio", "text"]


class ProcessResponse(BaseModel):
    prediction: Literal["depressed", "not_depressed"]
    confidence_score: float = Field(ge=0.0, le=1.0)
    explanation: List[ExplanationItem]
    # Coarse per-modality contribution to the fused prediction (roughly sums to 1.0).
    modality_contributions: Dict[str, float]

    # The exact vectors the models consumed, returned so the backend can store
    # them. That is what lets a future training set be built from real sessions
    # without re-running the whole media pipeline over archived video — and
    # therefore what lets the raw video be deleted on a retention schedule.
    #
    # Optional because the mock pipeline has no real features to report.
    text_features: Optional[List[float]] = None
    audio_features: Optional[List[float]] = None
    transcript_text: Optional[str] = None

    # The whole conversation in DAIC-WOZ format (tab-separated, CRLF,
    # start/stop/speaker/value). Kept so sessions recorded here can be appended
    # to a training set built from the corpus with no separate parser.
    daic_transcript: Optional[str] = None

    # Which diarized cluster was judged to be whom, and the cosine similarity
    # behind each judgement. Persisted with the session because this is the
    # decision that determined whose mental health was scored, and it has to
    # remain checkable after the audio is deleted on the retention schedule.
    speaker_similarities: Optional[Dict[str, Dict[str, float]]] = None
    participant_speaker: Optional[str] = None
    counselor_speaker: Optional[str] = None
    companion_speakers: Optional[List[str]] = None


class EnrollVoiceRequest(BaseModel):
    """A recording of one person reading the enrollment passage."""

    audio_path: str


class EnrollVoiceResponse(BaseModel):
    ok: bool
    # The voiceprint itself. Only ever the vector — the recording it came from
    # is deleted by the caller, because a vector cannot be played back and an
    # audio file can.
    embedding: Optional[List[float]] = None
    dimension: Optional[int] = None
    speech_seconds: Optional[float] = None
    # Written for the person who just recorded, not for a log: every failure
    # here is fixable by recording again, so it has to say what to change.
    error: Optional[str] = None
