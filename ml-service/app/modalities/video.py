"""
Video modality pipeline: frame extraction/preprocessing + the trained video model.

IMPORTANT: when the real video model is ready, replace only the body of
run_video_pipeline() below. Its signature and return type (VideoOutput) must
stay the same.

NOTE: unlike audio/text, this deliberately does NOT expose named sub-features
(e.g. specific facial-affect metrics). The real video model's feature set,
preprocessing, and dimensionality have not been provided yet, and inventing
plausible-sounding visual feature names would misrepresent what the video
model actually measures. Only a coarse depression_score is produced here; it
still contributes to modality_contributions in the final report.
"""

import random
from dataclasses import dataclass


@dataclass
class VideoOutput:
    # How strongly the visual signal leans toward "depressed", in [0, 1].
    depression_score: float


def run_video_pipeline(video_path: str) -> VideoOutput:
    """Mock implementation: frame extraction/preprocessing + trained video model."""
    depression_score = random.uniform(0.2, 0.8)
    return VideoOutput(depression_score=depression_score)
