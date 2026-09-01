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


def run_inference(session_id: str, video_path: str) -> ProcessResponse:
    """
    Runs the full mock pipeline: audio/text/video stages, then fusion.
    No training happens here or anywhere in this service — inference only.
    """
    _simulate_processing_delay()

    audio_output = run_audio_pipeline(video_path)
    text_output = run_text_pipeline(video_path)
    video_output = run_video_pipeline(video_path)

    fusion_result = fuse(audio_output, text_output, video_output)

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
    )
