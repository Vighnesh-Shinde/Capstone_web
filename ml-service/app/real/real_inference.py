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

import logging

import numpy as np

from app.languages import DEFAULT_LANGUAGE, LanguageNotScorable
from app.real import media_pipeline
from app.real.adequacy import check_length
from app.real.audio_features import compute_audio_features
from app.real.daic_transcript import build_participant_transcript, build_transcript
from app.real.model_loader import Models, fusion_input_modalities, scoring_languages
from app.real.text_features import compute_text_features
from app.schemas import ExplanationItem, ProcessResponse

logger = logging.getLogger("ml-service")


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


class VideoUnavailable(Exception):
    """
    The active fusion model needs a video probability and this recording has
    none — usually because no face was visible long enough to measure.

    Refused rather than scored with a guessed video input: substituting a
    neutral value would silently change what the fusion model computes, and
    dropping video would feed a three-input model two inputs.
    """

    def __init__(self, reason: str | None):
        super().__init__(
            "This deployment's analysis uses facial movement as well as speech, but no "
            "usable face could be measured in this recording"
            + (f" ({reason})" if reason else "")
            + ". Make sure the participant's face is clearly in frame and re-upload, or "
            "ask your administrator to switch to a text-and-audio fusion model."
        )


def run_real_inference(
    session_id: str,
    video_path: str,
    language: str = DEFAULT_LANGUAGE,
    counselor_embedding=None,
    companion_embeddings=None,
) -> ProcessResponse:
    # Checked before a frame is decoded. Transcribing an hour of Marathi and
    # only then admitting there is nothing to score it with wastes the
    # counselor's time and the participant's; refusing up front does not.
    if language not in scoring_languages():
        raise LanguageNotScorable(language)

    transcript = media_pipeline.process_video(
        video_path,
        language=language,
        counselor_embedding=counselor_embedding,
        companion_embeddings=companion_embeddings,
    )
    try:
        text_bundle = Models.text(language)
        audio_bundle = Models.audio(language)
        fusion_bundle = Models.fusion(language)

        text_raw = compute_text_features(transcript.participant_segments)

        # Checked before anything is predicted. An interview shorter than the
        # training range does not degrade the result gracefully — it pins the
        # text model to a constant that clears the fusion threshold, so every
        # such session reports "depressed" with a plausible confidence. See
        # adequacy.py for the measurements behind this.
        check_length(text_raw)
        audio_raw = compute_audio_features(transcript.wav_path, transcript)

        # Extracted here rather than in a later pass, because the recording is
        # deleted once its derived data is stored. Anything not taken now is
        # gone for good.
        #
        # A failure is recorded here rather than raised: with a two-input
        # fusion model video is not in the prediction, and a participant who
        # sat off camera should still get their report. Only a three-input
        # fusion turns a missing face into a refusal, below.
        video_features = None
        video_features_error = None
        try:
            from app.real.video_features import VideoFeatureError, compute_video_features
            video_features = [float(v) for v in compute_video_features(video_path)]
        except Exception as e:
            video_features_error = str(e)
            logger.warning("Video features unavailable for session %s: %s", session_id, e)

        probabilities = {
            "text": _predict_proba(text_bundle, text_raw),
            "audio": _predict_proba(audio_bundle, audio_raw),
        }

        # The fusion model's input width decides the path: two inputs is
        # [text, audio], three is [text, audio, video]. Order is part of the
        # contract — see FUSION_INPUT_WIDTHS in model_loader.
        fusion_inputs = fusion_input_modalities(fusion_bundle)
        video_bundle = None
        if "video" in fusion_inputs:
            if video_features is None:
                raise VideoUnavailable(video_features_error)
            video_bundle = Models.video(language)
            probabilities["video"] = _predict_proba(video_bundle, np.asarray(video_features))

        p_final = _predict_proba(
            fusion_bundle, np.array([probabilities[m] for m in fusion_inputs]))
        prediction = "depressed" if p_final >= fusion_bundle.threshold else "not_depressed"

        # Real modality contributions: the fusion model's learned coefficients
        # times this session's actual probabilities, not a fixed split. A
        # modality the fusion model does not take reports 0, which the report
        # renders as "Not used" rather than as a finding.
        fusion_coef = fusion_bundle.model.coef_[0]
        pulls = {m: abs(fusion_coef[i] * probabilities[m]) for i, m in enumerate(fusion_inputs)}
        total_pull = sum(pulls.values()) or 1.0
        modality_contributions = {
            m: round(pulls.get(m, 0.0) / total_pull, 4) for m in ("text", "audio", "video")
        }

        explanation = _explain_linear_pipeline(audio_bundle, audio_raw, modality="audio")
        if video_bundle is not None:
            # Best effort: only a linear video pipeline of the standard shape
            # can be attributed feature by feature. A missing explanation is
            # better than a failed report.
            try:
                explanation += _explain_linear_pipeline(
                    video_bundle, np.asarray(video_features), modality="video", top_k=4)
            except Exception as e:
                logger.warning("No per-feature explanation for the video model: %s", e)
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
            # The full conversation in DAIC-WOZ format, so a real session can
            # join a training set built from the corpus without a second parser.
            daic_transcript=build_transcript(transcript),
            participant_transcript=build_participant_transcript(transcript),
            video_features=video_features,
            video_features_error=video_features_error,
            # How each speaker was identified. Stored with the session so the
            # decision that determined whose voice was scored stays auditable
            # long after the audio itself has been deleted.
            speaker_similarities=transcript.speaker_similarities,
            counselor_speaker=transcript.counselor_speaker,
            participant_speaker=transcript.participant_speaker,
            companion_speakers=transcript.companion_speakers,
        )
    finally:
        media_pipeline.cleanup_wav(transcript.wav_path)
