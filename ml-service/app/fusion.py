"""
Multimodal fusion: combines the audio/text/video model outputs into the final
prediction, confidence, and per-modality contribution breakdown.

IMPORTANT: when the real trained fusion model is ready, replace only the body
of fuse() below. Its signature (three modality outputs in) and return type
(FusionResult out) must stay the same — main.py / mock_inference.py orchestrate
around this contract, not around how fusion is implemented internally.

The per-modality weighting below (MOCK_FUSION_WEIGHTS) is a placeholder for
this mock only. The real fusion model will have its own learned weighting
(or an entirely different fusion architecture, e.g. learned attention over
modality embeddings) — nothing here should be read as a guess at that.
"""

from dataclasses import dataclass
from typing import Dict, List, Literal

from app.modalities.audio import AudioOutput
from app.modalities.text import TextOutput
from app.modalities.video import VideoOutput

# Video is zero, matching the real pipeline rather than contradicting it.
#
# The research project's own evaluation found that including video made the
# fused result WORSE, so real_inference.py always reports video at 0.0 and the
# report renders it as "Not used — excluded from this model". A mock that
# instead shows video contributing a quarter of the decision exercises a state
# production can never reach, hides the state it always reaches, and — worst —
# leaves anyone reading a demo screenshot believing video analysis is part of
# the product. The mock's job is to stand in for the real pipeline, not to
# disagree with it.
MOCK_FUSION_WEIGHTS = {"audio": 0.55, "text": 0.45, "video": 0.0}


@dataclass
class FusionExplanationItem:
    feature_name: str
    contribution_score: float
    description: str
    modality: Literal["audio", "text"]


@dataclass
class FusionResult:
    prediction: Literal["depressed", "not_depressed"]
    confidence_score: float
    modality_contributions: Dict[str, float]
    explanation: List[FusionExplanationItem]


def fuse(audio_out: AudioOutput, text_out: TextOutput, video_out: VideoOutput) -> FusionResult:
    """Mock implementation: replace with the real trained fusion model."""
    weighted_score = (
        audio_out.depression_score * MOCK_FUSION_WEIGHTS["audio"]
        + text_out.depression_score * MOCK_FUSION_WEIGHTS["text"]
        + video_out.depression_score * MOCK_FUSION_WEIGHTS["video"]
    )

    prediction: Literal["depressed", "not_depressed"] = (
        "depressed" if weighted_score >= 0.5 else "not_depressed"
    )

    # Map distance from the decision boundary (0.5) onto a realistic confidence range.
    distance = abs(weighted_score - 0.5) * 2  # 0..1
    confidence_score = round(0.6 + distance * 0.35, 2)
    confidence_score = min(confidence_score, 0.97)

    pulls = {
        "audio": MOCK_FUSION_WEIGHTS["audio"] * abs(audio_out.depression_score - 0.5),
        "text": MOCK_FUSION_WEIGHTS["text"] * abs(text_out.depression_score - 0.5),
        "video": MOCK_FUSION_WEIGHTS["video"] * abs(video_out.depression_score - 0.5),
    }
    total_pull = sum(pulls.values())
    if total_pull > 0:
        modality_contributions = {k: round(v / total_pull, 2) for k, v in pulls.items()}
    else:
        modality_contributions = dict(MOCK_FUSION_WEIGHTS)

    explanation: List[FusionExplanationItem] = []
    for feature in audio_out.features:
        explanation.append(
            FusionExplanationItem(
                feature_name=feature.feature_name,
                contribution_score=feature.contribution_score,
                description=feature.description,
                modality="audio",
            )
        )
    for feature in text_out.features:
        explanation.append(
            FusionExplanationItem(
                feature_name=feature.feature_name,
                contribution_score=feature.contribution_score,
                description=feature.description,
                modality="text",
            )
        )
    explanation.sort(key=lambda item: abs(item.contribution_score), reverse=True)

    return FusionResult(
        prediction=prediction,
        confidence_score=confidence_score,
        modality_contributions=modality_contributions,
        explanation=explanation,
    )
