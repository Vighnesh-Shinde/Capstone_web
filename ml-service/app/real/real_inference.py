"""
Real inference orchestrator — the real-model counterpart to
app/mock_inference.py, producing the exact same ProcessResponse shape so the
backend/frontend contract never has to change.

    video -> media_pipeline.process_video()          (real, built now)
          -> text_features.compute_text_features()   (STUB — raises NotImplementedError)
          -> audio_features.compute_audio_features()  (STUB — raises NotImplementedError)
          -> model1.predict_proba, model2.predict_proba
          -> fusion.predict_proba([p_text, p_audio])
          -> threshold -> ProcessResponse

Until the two feature stubs are filled in (see PENDING_FROM_FRIEND.md), this
raises NotImplementedError, which main.py maps to a clean 503 — the Spring
Boot backend already treats any ML-service error as session status FAILED,
so this degrades gracefully with zero backend changes.
"""

import numpy as np

from app.languages import DEFAULT_LANGUAGE, LanguageNotScorable
from app.real import media_pipeline
from app.real.audio_features import compute_audio_features
from app.real.model_loader import Models, scoring_languages
from app.real.text_features import compute_text_features
from app.schemas import ExplanationItem, ProcessResponse


def _predict_proba(bundle, features: np.ndarray) -> float:
    x = np.asarray(features, dtype=float).reshape(1, -1)
    return float(bundle.model.predict_proba(x)[0, 1])


def _explain_linear_pipeline(bundle, raw_features: np.ndarray, modality: str, top_k: int = 6) -> list[ExplanationItem]:
    """
    Real, non-fabricated per-feature contributions for a scikit-learn Pipeline
    shaped [imputer, StandardScaler, SelectKBest, linear classifier] (this is
    exactly the audio model's shape). Each selected feature's contribution to
    the logit is coefficient * standardized_value — the standard, honest way
    to attribute a linear model's prediction to its inputs.

    Not used for the text model: an RBF-kernel SVM has no linear
    coefficients, so there is no equally honest per-feature attribution to
    compute — see text_features.py's docstring.
    """
    pipeline = bundle.model
    imputer = pipeline.named_steps["imp"]
    scaler = pipeline.named_steps["sc"]
    selector = pipeline.named_steps["sel"]
    clf = pipeline.named_steps["clf"]

    imputed = imputer.transform(raw_features.reshape(1, -1))
    scaled = scaler.transform(imputed)[0]
    selected_mask = selector.get_support()
    selected_values = scaled[selected_mask]
    selected_names = [c for c, keep in zip(bundle.cols, selected_mask) if keep]
    coefficients = clf.coef_[0]

    contributions = coefficients * selected_values
    order = np.argsort(-np.abs(contributions))[:top_k]

    items = []
    for i in order:
        name = selected_names[i]
        score = float(contributions[i])
        direction = "above" if selected_values[i] > 0 else "below"
        items.append(ExplanationItem(
            feature_name=name.replace("_", " "),
            contribution_score=round(score, 4),
            description=f"{name.replace('_', ' ')} was {direction} average for this session",
            modality=modality,
        ))
    return items


def run_real_inference(
    session_id: str,
    video_path: str,
    language: str = DEFAULT_LANGUAGE,
) -> ProcessResponse:
    # Checked before a frame is decoded. Transcribing an hour of Marathi and
    # only then admitting there is nothing to score it with wastes the
    # counselor's time and the participant's; refusing up front does not.
    if language not in scoring_languages():
        raise LanguageNotScorable(language)

    transcript = media_pipeline.process_video(video_path, language=language)
    try:
        text_bundle = Models.text(language)
        audio_bundle = Models.audio(language)
        fusion_bundle = Models.fusion(language)

        text_raw = compute_text_features(transcript.participant_segments)
        audio_raw = compute_audio_features(transcript.wav_path, transcript)

        p_text = _predict_proba(text_bundle, text_raw)
        p_audio = _predict_proba(audio_bundle, audio_raw)

        # Order matters: the fusion model was trained on [text, audio].
        p_final = _predict_proba(fusion_bundle, np.array([p_text, p_audio]))
        prediction = "depressed" if p_final >= fusion_bundle.threshold else "not_depressed"

        # Real modality contributions: the fusion model's actual learned
        # coefficients times this session's actual probabilities (not a
        # fixed static split) — video stays 0 since it's intentionally
        # excluded from the recommended pipeline.
        fusion_coef = fusion_bundle.model.coef_[0]  # [text_weight, audio_weight]
        pulls = {
            "text": abs(fusion_coef[0] * p_text),
            "audio": abs(fusion_coef[1] * p_audio),
        }
        total_pull = sum(pulls.values()) or 1.0
        modality_contributions = {
            "text": round(pulls["text"] / total_pull, 4),
            "audio": round(pulls["audio"] / total_pull, 4),
            "video": 0.0,
        }

        explanation = _explain_linear_pipeline(audio_bundle, audio_raw, modality="audio")
        # Text model (RBF-SVM) intentionally has no per-feature explanation —
        # see _explain_linear_pipeline's docstring.

        return ProcessResponse(
            prediction=prediction,
            confidence_score=round(p_final, 4),
            explanation=explanation,
            modality_contributions=modality_contributions,
            # Returned so the backend can persist them: these are exactly what
            # a retrained model would need as input, so storing them means a
            # training set can be assembled later without the original video.
            text_features=[float(v) for v in text_raw],
            audio_features=[float(v) for v in audio_raw],
            # Participant speech only — the counselor's turns are excluded, the
            # same way the text model sees it.
            transcript_text=" ".join(
                seg.text for seg in transcript.participant_segments
            ).strip(),
        )
    finally:
        media_pipeline.cleanup_wav(transcript.wav_path)
