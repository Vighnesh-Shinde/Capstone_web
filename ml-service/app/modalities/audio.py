"""
Audio modality pipeline: audio extraction/preprocessing + the trained audio model.

IMPORTANT: when the real audio model is ready, replace only the body of
run_audio_pipeline() below. Its signature and return type (AudioOutput) must
stay the same — everything downstream (fusion, the API contract) depends only
on this contract, not on how the audio representation is produced.
"""

import random
from dataclasses import dataclass, field
from typing import List


@dataclass
class AudioFeature:
    feature_name: str
    contribution_score: float
    description: str


@dataclass
class AudioOutput:
    # How strongly the audio signal leans toward "depressed", in [0, 1].
    # This is the audio model's raw output/representation, not a final prediction.
    depression_score: float
    features: List[AudioFeature] = field(default_factory=list)


_AUDIO_FEATURE_POOL = [
    {
        "feature_name": "speech pace",
        "depressed": "Slower than average speaking rate",
        "not_depressed": "Speaking rate within a typical, energetic range",
    },
    {
        "feature_name": "pause frequency",
        "depressed": "Frequent long pauses between phrases",
        "not_depressed": "Few long pauses; fluent, continuous speech",
    },
    {
        "feature_name": "pitch variance",
        "depressed": "Reduced pitch variance, indicating flatter vocal affect",
        "not_depressed": "Healthy pitch variance, indicating expressive vocal affect",
    },
    {
        "feature_name": "filler word rate",
        "depressed": "Elevated use of filler words (\"um\", \"uh\") suggesting hesitancy",
        "not_depressed": "Low filler word rate, suggesting confident articulation",
    },
]


def run_audio_pipeline(video_path: str) -> AudioOutput:
    """Mock implementation: audio extraction + preprocessing + trained audio model."""
    depression_score = random.uniform(0.2, 0.8)

    num_features = random.randint(2, len(_AUDIO_FEATURE_POOL))
    chosen = random.sample(_AUDIO_FEATURE_POOL, num_features)

    features = []
    for feature in chosen:
        magnitude = round(random.uniform(0.05, 0.35), 2)
        leans_depressed = depression_score >= 0.5
        description = feature["depressed"] if leans_depressed else feature["not_depressed"]
        contribution = magnitude if leans_depressed else -magnitude
        features.append(
            AudioFeature(
                feature_name=feature["feature_name"],
                contribution_score=round(contribution, 2),
                description=description,
            )
        )

    return AudioOutput(depression_score=depression_score, features=features)
