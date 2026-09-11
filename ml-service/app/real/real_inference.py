"""
Real inference orchestrator — the real-model counterpart to
app/mock_inference.py, producing the exact same ProcessResponse shape so the
backend/frontend contract never has to change.

    video -> media_pipeline.process_video()            speech -> diarised transcript
          -> text_features / audio_features            named features
          -> openface_features (only if the serving    started first, in parallel
             video model reads OpenFace features)
          -> each model, fed its own columns           see feature_space.py
          -> fusion.predict_proba([p_text, p_audio(, p_video)])
          -> threshold -> ProcessResponse
"""

import logging

import numpy as np

from app.languages import DEFAULT_LANGUAGE, LanguageNotScorable
from app.real import media_pipeline, openface_features
from app.real.adequacy import check_length
from app.real.audio_features import compute_audio_feature_map, legacy_audio_vector
from app.real.daic_transcript import build_participant_transcript, build_transcript
from app.real.feature_space import TEXT_COLS, extractor_for, model_columns, select
from app.real.model_loader import Models, feature_count, fusion_input_modalities, scoring_languages
from app.real.text_features import compute_text_features
from app.schemas import ExplanationItem, ProcessResponse

logger = logging.getLogger("ml-service")


def _predict_proba(bundle, features: np.ndarray) -> float:
    x = np.asarray(features, dtype=float).reshape(1, -1)
    return float(bundle.model.predict_proba(x)[0, 1])


def _has_standard_steps(bundle) -> bool:
    steps = getattr(bundle.model, "named_steps", {})
    return all(s in steps for s in ("imp", "sc", "sel", "clf"))


def _is_linear_pipeline(bundle) -> bool:
    return _has_standard_steps(bundle) and hasattr(bundle.model.named_steps["clf"], "coef_")


def _log_distance_from_training(bundle, features: np.ndarray, modality: str, session_id: str) -> None:
    """
    Warn when a session's features sit far outside the model's training data.

    Every model here learned from DAIC-WOZ interviews, and a recording can
    differ from those in ways that have nothing to do with the participant: a
    different camera, microphone, tracker version or interview length. Such a
    model still returns a confident probability — this project has already
    shipped one bug that way, where short recordings pinned the text model to
    a constant. This does not change the result; it makes the mismatch visible
    in the log, measured against the model's own fitted scaler.
    """
    if not _has_standard_steps(bundle):
        return
    steps = bundle.model.named_steps
    z = steps["sc"].transform(steps["imp"].transform(np.asarray(features, float).reshape(1, -1)))[0]
    z = z[steps["sel"].get_support()]
    far = int((np.abs(z) > 4).sum())
    if far:
        logger.warning(
            "Session %s: %d of the %d %s features the model uses are more than 4 SD from its "
            "training data (largest |z| %.1f). This recording is outside the range the %s "
            "model learned from, so its probability should be read with caution.",
            session_id, far, len(z), modality, float(np.abs(z).max()), modality)


def _linear_contributions(bundle, features: np.ndarray, cols: list[str]):
    """
    (name, contribution, standardised value) for every feature a pipeline
    shaped [imputer, StandardScaler, SelectKBest, linear classifier] selected.

    Each contribution is coefficient × standardised value: that feature's exact
    share of the model's log-odds. Real, not fabricated — and only possible
    because the model is linear.
    """
    pipeline = bundle.model
    imputed = pipeline.named_steps["imp"].transform(np.asarray(features, float).reshape(1, -1))
    scaled = pipeline.named_steps["sc"].transform(imputed)[0]
    mask = pipeline.named_steps["sel"].get_support()
    names = [c for c, keep in zip(cols, mask) if keep]
    values = scaled[mask]
    contributions = pipeline.named_steps["clf"].coef_[0] * values
    return list(zip(names, contributions, values))


def _item(name: str, contribution: float, value: float, modality: str) -> ExplanationItem:
    label = name.replace("_", " ")
    direction = "above" if value > 0 else "below"
    return ExplanationItem(
        feature_name=label,
        contribution_score=round(float(contribution), 4),
        description=f"{label} was {direction} average for this session",
        modality=modality,
    )


def _explain_linear_pipeline(bundle, features: np.ndarray, cols: list[str], modality: str,
                             top_k: int = 6) -> list[ExplanationItem]:
    parts = sorted(_linear_contributions(bundle, features, cols), key=lambda p: -abs(p[1]))
    return [_item(n, c, v, modality) for n, c, v in parts[:top_k]]


def _explain_text(bundle, features: np.ndarray, cols: list[str], top_k: int = 3) -> list[ExplanationItem]:
    """
    Per-feature reasons for a LINEAR text model. The DAIC-WOZ model is one; the
    RBF model it replaces had no coefficients, which is why reports used to
    explain audio but not text.

    The inputs come in two kinds. The 24 lexical features are habits a person
    can recognise — "used more negative words than positive ones" — and each is
    reported on its own. The 3,072 sentence-meaning columns are coordinates in
    an embedding space: no single one means anything, and "mpnet 567 was above
    average" would be a reason nobody can read. Their contributions are summed
    into one "what was said, overall" item. For a linear model that sum is
    exact, not an approximation — the log-odds is a sum.
    """
    parts = _linear_contributions(bundle, features, cols)
    lexical = sorted((p for p in parts if p[0].startswith("lex_")), key=lambda p: -abs(p[1]))
    meaning = sum(c for n, c, _ in parts if n.startswith("mpnet_"))

    items = [_item(n, c, v, "text") for n, c, v in lexical[:top_k]]
    if any(n.startswith("mpnet_") for n, _, _ in parts):
        closer_to = "depressed participants" if meaning > 0 else "participants who were not depressed"
        items.append(ExplanationItem(
            feature_name="sentence meaning",
            contribution_score=round(float(meaning), 4),
            description=f"what was said, taken as a whole, was closer in meaning to {closer_to} "
                        f"in the training interviews",
            modality="text",
        ))
    return sorted(items, key=lambda i: -abs(i.contribution_score))


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

    # Which models serve decides which extractors this session needs, so it is
    # settled before the recording is touched.
    text_bundle = Models.text(language)
    audio_bundle = Models.audio(language)
    fusion_bundle = Models.fusion(language)
    text_cols = model_columns("text", text_bundle.cols, feature_count(text_bundle.model))
    audio_cols = model_columns("audio", audio_bundle.cols, feature_count(audio_bundle.model))

    # The fusion model's input width decides the path: two inputs is
    # [text, audio], three is [text, audio, video]. Order is part of the
    # contract — see FUSION_INPUT_WIDTHS in model_loader.
    fusion_inputs = fusion_input_modalities(fusion_bundle)
    video_bundle = video_cols = video_extractor = None
    if "video" in fusion_inputs:
        video_bundle = Models.video(language)
        video_cols = model_columns("video", video_bundle.cols, feature_count(video_bundle.model))
        video_extractor = extractor_for("video", video_cols)

    # OpenFace is a separate process, so it starts now and runs while speech is
    # transcribed, instead of adding its whole running time afterwards.
    openface_job = openface_features.start(video_path) if video_extractor == "openface" else None

    transcript = media_pipeline.process_video(
        video_path,
        language=language,
        counselor_embedding=counselor_embedding,
        companion_embeddings=companion_embeddings,
    )
    try:
        text_raw = compute_text_features(transcript.participant_segments)

        # Checked before anything is predicted. An interview shorter than the
        # training range does not degrade the result gracefully — it pins the
        # text model to a constant that clears the fusion threshold, so every
        # such session reports "depressed" with a plausible confidence. See
        # adequacy.py for the measurements behind this.
        check_length(text_raw)
        audio_map = compute_audio_feature_map(transcript.wav_path, transcript)
        audio_raw = legacy_audio_vector(audio_map)

        # MediaPipe geometry is what the session record stores, whichever
        # model serves. Extracted here rather than in a later pass, because the
        # recording is deleted once its derived data is stored; anything not
        # taken now is gone for good. A failure is recorded, not raised: a
        # participant who sat off camera should still get their report unless
        # the serving fusion model actually needs their face.
        video_features = None
        video_features_error = None
        try:
            from app.real.video_features import compute_video_features
            video_features = [float(v) for v in compute_video_features(video_path)]
        except Exception as e:
            video_features_error = str(e)
            logger.warning("Video features unavailable for session %s: %s", session_id, e)

        # Each model is fed its own columns, by name.
        x_text = select(dict(zip(TEXT_COLS, text_raw)), text_cols)
        x_audio = select(audio_map, audio_cols)
        probabilities = {
            "text": _predict_proba(text_bundle, x_text),
            "audio": _predict_proba(audio_bundle, x_audio),
        }

        x_video = None
        if video_bundle is not None:
            if video_extractor == "openface":
                try:
                    video_map = openface_job.result()
                except openface_features.OpenFaceError as e:
                    raise VideoUnavailable(str(e)) from e
                except Exception as e:
                    logger.exception("OpenFace failed for session %s", session_id)
                    raise VideoUnavailable("facial analysis failed") from e
            else:
                if video_features is None:
                    raise VideoUnavailable(video_features_error)
                from app.real.video_features import VIDEO_COLS
                video_map = dict(zip(VIDEO_COLS, video_features))
            x_video = select(video_map, video_cols)
            probabilities["video"] = _predict_proba(video_bundle, x_video)

        for bundle, x, modality in ((text_bundle, x_text, "text"), (audio_bundle, x_audio, "audio"),
                                    (video_bundle, x_video, "video")):
            if bundle is not None:
                _log_distance_from_training(bundle, x, modality, session_id)

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
        logger.info("Session %s: p=%s fused=%.4f threshold=%.4f -> %s", session_id,
                    {m: round(p, 4) for m, p in probabilities.items()}, p_final,
                    fusion_bundle.threshold, prediction)

        # Only a linear pipeline of the standard shape can be attributed feature
        # by feature. A missing explanation is better than a failed report.
        explanation: list[ExplanationItem] = []
        for bundle, x, cols, modality, explain in (
            (text_bundle, x_text, text_cols, "text", _explain_text),
            (audio_bundle, x_audio, audio_cols, "audio", _explain_linear_pipeline),
            (video_bundle, x_video, video_cols, "video", _explain_linear_pipeline),
        ):
            if bundle is None or not _is_linear_pipeline(bundle):
                continue
            try:
                if modality == "text":
                    explanation += explain(bundle, x, cols)
                else:
                    explanation += explain(bundle, x, cols, modality=modality,
                                           top_k=6 if modality == "audio" else 4)
            except Exception as e:
                logger.warning("No per-feature explanation for the %s model: %s", modality, e)

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
