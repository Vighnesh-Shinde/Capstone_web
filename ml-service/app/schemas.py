from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    session_id: str
    video_path: str
    # BCP-47 code chosen by the counselor when the session was created. Defaults
    # to English so an older backend that doesn't send it keeps working, and so
    # the default is the one language actually validated end to end.
    language: str = "en"


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
