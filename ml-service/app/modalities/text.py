"""
Text modality pipeline: transcript acquisition + preprocessing/tokenization +
the trained text model.

IMPORTANT: when the real text model (and whatever transcription tool the ML
pipeline settles on) is ready, replace only the body of run_text_pipeline()
below. Its signature and return type (TextOutput) must stay the same.
"""

import random
from dataclasses import dataclass, field
from typing import List


@dataclass
class TextFeature:
    feature_name: str
    contribution_score: float
    description: str


@dataclass
class TextOutput:
    # How strongly the text/transcript signal leans toward "depressed", in [0, 1].
    depression_score: float
    features: List[TextFeature] = field(default_factory=list)


_TEXT_FEATURE_POOL = [
    {
        "feature_name": "sentiment",
        "depressed": "Predominantly negative sentiment in responses",
        "not_depressed": "Predominantly neutral to positive sentiment in responses",
    },
    {
        "feature_name": "word count",
        "depressed": "Lower overall word count relative to interview length",
        "not_depressed": "Word count consistent with typical response length",
    },
]


def run_text_pipeline(video_path: str) -> TextOutput:
    """Mock implementation: transcript + preprocessing + trained text model."""
    depression_score = random.uniform(0.2, 0.8)

    num_features = random.randint(1, len(_TEXT_FEATURE_POOL))
    chosen = random.sample(_TEXT_FEATURE_POOL, num_features)

    features = []
    for feature in chosen:
        magnitude = round(random.uniform(0.05, 0.35), 2)
        leans_depressed = depression_score >= 0.5
        description = feature["depressed"] if leans_depressed else feature["not_depressed"]
        contribution = magnitude if leans_depressed else -magnitude
        features.append(
            TextFeature(
                feature_name=feature["feature_name"],
                contribution_score=round(contribution, 2),
                description=description,
            )
        )

    return TextOutput(depression_score=depression_score, features=features)
