"""
Orchestrates the multimodal inference pipeline for the depression-detection
ML service: audio pipeline + text pipeline + video pipeline -> fusion.

This module exists so the rest of the platform can be built and tested
before the real audio/text/video/fusion models (currently training on a
remote GPU machine) are available. Every stage it calls is independently
swappable — see the docstrings in app/modalities/audio.py, app/modalities/text.py,
app/modalities/video.py, and app/fusion.py. This orchestrator itself should
not need to change when real models are integrated; only the stage bodies do.
"""

import random
import time

from app.fusion import fuse
from app.modalities.audio import run_audio_pipeline
from app.modalities.text import run_text_pipeline
from app.modalities.video import run_video_pipeline
from app.schemas import ExplanationItem, ProcessResponse


def _simulate_processing_delay() -> None:
    time.sleep(random.uniform(1.0, 3.0))


def _mock_speaker_attribution(companion_count: int):
    """
    Plausible speaker-identification output, so the report's "Who was analysed"
    panel can be exercised without the real models.

    The numbers are shaped like the real thing — a known speaker scores high
    against their own enrolled voice and near zero against everyone else's,
    while the participant, who is enrolled nowhere, scores low against all of
    them. That is what makes the panel readable in mock mode; the real
    similarities come from cosine distance between actual embeddings.
    """
    participant = "SPEAKER_00"
    counselor = "SPEAKER_01"
    companions = [f"SPEAKER_{i + 2:02d}" for i in range(companion_count)]

    roles = ["counselor"] + [f"companion:{i}" for i in range(companion_count)]
    similarities = {}
    for label in [participant, counselor, *companions]:
        own = "counselor" if label == counselor else (
            f"companion:{companions.index(label)}" if label in companions else None
        )
        similarities[label] = {
            role: round(random.uniform(0.72, 0.88) if role == own
                        else random.uniform(-0.05, 0.22), 4)
            for role in roles
        }

    return participant, counselor, companions, similarities


def run_inference(
    session_id: str,
    video_path: str,
    companion_count: int = 0,
) -> ProcessResponse:
    """
    Runs the full mock pipeline: audio/text/video stages, then fusion.
    No training happens here or anywhere in this service — inference only.
    """
    _simulate_processing_delay()

    audio_output = run_audio_pipeline(video_path)
    text_output = run_text_pipeline(video_path)
    video_output = run_video_pipeline(video_path)

    fusion_result = fuse(audio_output, text_output, video_output)

    participant, counselor, companions, similarities = _mock_speaker_attribution(companion_count)

    return ProcessResponse(
        prediction=fusion_result.prediction,
        confidence_score=fusion_result.confidence_score,
        explanation=[
            ExplanationItem(
                feature_name=item.feature_name,
                contribution_score=item.contribution_score,
                description=item.description,
                modality=item.modality,
            )
            for item in fusion_result.explanation
        ],
        modality_contributions=fusion_result.modality_contributions,
        participant_speaker=participant,
        counselor_speaker=counselor,
        companion_speakers=companions,
        speaker_similarities=similarities,
    )
