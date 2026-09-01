from typing import Dict, List, Literal

from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    session_id: str
    video_path: str


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
