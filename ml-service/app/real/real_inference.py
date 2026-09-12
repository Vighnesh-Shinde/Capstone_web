"""
Real inference orchestrator — the real-model counterpart to
app/mock_inference.py, producing the exact same ProcessResponse shape so the
backend/frontend contract never has to change.

    video -> media_pipeline.process_video()            speech -> diarised transcript
          -> text_features / audio_features            named features
          -> openface_features (only when the serving   started first, in parallel
             model reads OpenFace features)
          -> the serving model(s)                      see feature_space.py

Two shapes of model are supported, and the manifest decides which serves:

  * text + audio + fusion (+ optional video): each modality is scored on its
    own and a fusion model combines the probabilities. Its input width decides
    whether video is used — see FUSION_INPUT_WIDTHS.
  * early fusion: ONE model on the concatenated features of every modality.
    There are no per-modality probabilities; the modality shares and the
    explanation come from the model's own feature contributions, mapped back
    through its per-block PCA.
"""

import logging

import numpy as np

from app.languages import DEFAULT_LANGUAGE, LanguageNotScorable
from app.real import media_pipeline, openface_features
from app.real.adequacy import check_length
from app.real.audio_features import compute_audio_feature_map, legacy_audio_vector
from app.real.daic_transcript import build_participant_transcript, build_transcript
from app.real.feature_space import (
    TEXT_COLS, extractor_for, model_columns, modality_of, select, sources_for,
)
from app.real.model_loader import (
    Models, early_fusion_installed, feature_count, fusion_input_modalities, scoring_languages,
)
from app.real.text_features import compute_text_features
from app.schemas import ExplanationItem, ProcessResponse

logger = logging.getLogger("ml-service")

MODALITIES = ("text", "audio", "video")


def _predict_proba(bundle, features: np.ndarray) -> float:
    x = np.asarray(features, dtype=float).reshape(1, -1)
    return float(bundle.model.predict_proba(x)[0, 1])


def _has_standard_steps(bundle) -> bool:
    steps = getattr(bundle.model, "named_steps", {})
    return all(s in steps for s in ("imp", "sc", "sel", "clf"))


def _is_linear_pipeline(bundle) -> bool:
    return _has_standard_steps(bundle) and hasattr(bundle.model.named_steps["clf"], "coef_")


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


def _early_fusion_blocks(bundle, features: np.ndarray, cols: list[str]):
    """
    One tuple per modality block of an early-fusion pipeline:
    (block name, its column names, standardised values, weight on each column).

    The pipeline is [ColumnTransformer(per block: imputer -> scaler -> PCA) ->
    linear classifier]. Both stages are linear, so a component's coefficient
    maps straight back onto the original columns:

        weights = coef[this block's components] @ pca.components_

    which makes a per-feature attribution exact rather than approximate.
    """
    pipeline = bundle.model
    transformer = pipeline.named_steps["blocks"]
    coefficients = pipeline.named_steps["clf"].coef_.ravel()
    position_of = {c: i for i, c in enumerate(cols)}
    x = np.asarray(features, float).reshape(1, -1)

    start = 0
    for name, block, spec in transformer.transformers_:
        if isinstance(spec, slice):
            indices = list(range(*spec.indices(len(cols))))
        else:
            indices = [position_of[s] if isinstance(s, str) else int(s)
                       for s in np.atleast_1d(spec)]
        steps = block.named_steps
        scaled = steps["sc"].transform(steps["imp"].transform(x[:, indices]))[0]
        pca = steps["pca"]
        weights = coefficients[start:start + pca.n_components_] @ pca.components_
        start += pca.n_components_
        yield name, [cols[i] for i in indices], scaled, weights


def _distance_from_training(bundle, features: np.ndarray, cols: list[str], modality: str,
                            session_id: str) -> dict | None:
    """
    Warn when a session's features sit far outside the model's training data.

    Every model here learned from DAIC-WOZ interviews, and a recording can
    differ from those in ways that have nothing to do with the participant: a
    different camera, microphone, tracker version or interview length. Such a
    model still returns a confident probability — this project has already
    shipped one bug that way, where short recordings pinned the text model to
    a constant. This does not change the result; it makes the mismatch visible
    in the log and on the report, measured against the model's own fitted scaler.
    """
    if not _has_standard_steps(bundle):
        return None
    steps = bundle.model.named_steps
    z = steps["sc"].transform(steps["imp"].transform(np.asarray(features, float).reshape(1, -1)))[0]
    mask = steps["sel"].get_support()
    z = z[mask]
    names = [c for c, keep in zip(cols, mask) if keep]
    return _warning(z, names, modality, session_id)


def _warning(z: np.ndarray, names: list[str], modality: str, session_id: str) -> dict | None:
    far = int((np.abs(z) > 4).sum())
    if not far:
        return None
    logger.warning(
        "Session %s: %d of the %d %s features the model uses are more than 4 SD from its "
        "training data (largest |z| %.1f). This recording is outside the range the %s "
        "model learned from, so its probability should be read with caution.",
        session_id, far, len(z), modality, float(np.abs(z).max()), modality)
    return {
        "modality": modality,
        "far": far,
        "total": len(z),
        "max_z": round(float(np.abs(z).max()), 1),
        # The single most out-of-range measurement: something a reader can
        # act on ("recording volume"), where a count alone is not.
        "worst_feature": names[int(np.argmax(np.abs(z)))],
    }


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


def _text_items(parts, top_k: int = 3) -> list[ExplanationItem]:
    """
    Text reasons from per-feature contributions.

    The inputs come in two kinds. The 24 lexical features are habits a person
    can recognise — "used more negative words than positive ones" — and each is
    reported on its own. The 3,072 sentence-meaning columns are coordinates in
    an embedding space: no single one means anything, and "mpnet 567 was above
    average" would be a reason nobody can read. Their contributions are summed
    into one "what was said, overall" item. For a linear model that sum is
    exact, not an approximation — the log-odds is a sum.
    """
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
    return items


def _explain_text(bundle, features: np.ndarray, cols: list[str], top_k: int = 3) -> list[ExplanationItem]:
    """Per-feature reasons for a LINEAR per-modality text model."""
    items = _text_items(_linear_contributions(bundle, features, cols), top_k)
    return sorted(items, key=lambda i: -abs(i.contribution_score))


class VideoUnavailable(Exception):
    """
    The serving model needs facial measurements and this recording has none —
    usually because no face was visible long enough to measure.

    Refused rather than scored with a guessed video input: substituting a
    neutral value would silently change what the model computes, and dropping
    the columns would feed it a vector it was never trained on.
    """

    def __init__(self, reason: str | None):
        super().__init__(
            "This deployment's analysis uses facial movement as well as speech, but no "
            "usable face could be measured in this recording"
            + (f" ({reason})" if reason else "")
            + ". Make sure the participant's face is clearly in frame and re-upload, or "
            "ask your administrator to switch to a model that does not use video."
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
    early = early_fusion_installed(language)
    text_bundle = audio_bundle = fusion_bundle = video_bundle = early_bundle = None
    text_cols = audio_cols = video_cols = early_cols = None
    fusion_inputs: tuple[str, ...] = ()
    video_extractor = None

    if early:
        early_bundle = Models.early_fusion(language)
        early_cols = model_columns(
            "early_fusion", early_bundle.cols, feature_count(early_bundle.model))
        sources = sources_for(early_cols)
        if "video_openface" in sources:
            video_extractor = "openface"
        elif "video_mediapipe" in sources:
            video_extractor = "mediapipe"
    else:
        text_bundle = Models.text(language)
        audio_bundle = Models.audio(language)
        fusion_bundle = Models.fusion(language)
        text_cols = model_columns("text", text_bundle.cols, feature_count(text_bundle.model))
        audio_cols = model_columns("audio", audio_bundle.cols, feature_count(audio_bundle.model))

        # The fusion model's input width decides the path: two inputs is
        # [text, audio], three is [text, audio, video]. Order is part of the
        # contract — see FUSION_INPUT_WIDTHS in model_loader.
        fusion_inputs = fusion_input_modalities(fusion_bundle)
        if "video" in fusion_inputs:
            video_bundle = Models.video(language)
            video_cols = model_columns(
                "video", video_bundle.cols, feature_count(video_bundle.model))
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
        # text model to a constant that clears the threshold, so every such
        # session reports "depressed" with a plausible confidence. See
        # adequacy.py for the measurements behind this.
        check_length(text_raw)
        audio_map = compute_audio_feature_map(transcript.wav_path, transcript)
        audio_raw = legacy_audio_vector(audio_map)

        # MediaPipe geometry is what the session record stores, whichever
        # model serves. Extracted here rather than in a later pass, because the
        # recording is deleted once its derived data is stored; anything not
        # taken now is gone for good. A failure is recorded, not raised: a
        # participant who sat off camera should still get their report unless
        # the serving model actually needs their face.
        video_features = None
        video_features_error = None
        try:
            from app.real.video_features import compute_video_features
            video_features = [float(v) for v in compute_video_features(video_path)]
        except Exception as e:
            video_features_error = str(e)
            logger.warning("Video features unavailable for session %s: %s", session_id, e)

        def openface_map() -> dict[str, float]:
            try:
                return openface_job.result()
            except openface_features.OpenFaceError as e:
                raise VideoUnavailable(str(e)) from e
            except Exception as e:
                logger.exception("OpenFace failed for session %s", session_id)
                raise VideoUnavailable("facial analysis failed") from e

        def mediapipe_map() -> dict[str, float]:
            if video_features is None:
                raise VideoUnavailable(video_features_error)
            from app.real.video_features import VIDEO_COLS
            return dict(zip(VIDEO_COLS, video_features))

        explanation: list[ExplanationItem] = []
        distribution_warnings: list[dict] = []

        if early:
            # One model, one vector: every extractor's output merged by name.
            feature_map: dict[str, float] = dict(zip(TEXT_COLS, text_raw))
            feature_map.update(audio_map)
            if video_extractor == "openface":
                feature_map.update(openface_map())
            elif video_extractor == "mediapipe":
                feature_map.update(mediapipe_map())

            x_early = select(feature_map, early_cols)
            p_final = _predict_proba(early_bundle, x_early)
            threshold = early_bundle.threshold

            # Shares and reasons come from the model's own feature
            # contributions: there are no per-modality probabilities to divide.
            pulls = {m: 0.0 for m in MODALITIES}
            try:
                blocks = list(_early_fusion_blocks(early_bundle, x_early, early_cols))
            except Exception as e:
                logger.warning("No per-feature explanation for the early-fusion model: %s", e)
                blocks = []

            by_modality: dict[str, list] = {m: [] for m in MODALITIES}
            for name, names, scaled, weights in blocks:
                for column, value, weight in zip(names, scaled, weights):
                    modality = modality_of(column)
                    by_modality[modality].append((column, float(weight * value), float(value)))
                    pulls[modality] += abs(float(weight * value))
                warning = _warning(scaled, names, modality_of(names[0]) if names else name, session_id)
                if warning:
                    distribution_warnings.append(warning)

            explanation = _text_items(by_modality["text"])
            for modality, top_k in (("audio", 5), ("video", 4)):
                ranked = sorted(by_modality[modality], key=lambda p: -abs(p[1]))[:top_k]
                explanation += [_item(n, c, v, modality) for n, c, v in ranked]
            # A modality the model gives no weight produces rows that all round
            # to 0.0000. Listing them as "reasons" would be padding: the honest
            # statement is that this part of the recording changed nothing, and
            # the modality shares above already say so.
            explanation = sorted(
                (i for i in explanation if abs(i.contribution_score) >= 0.0005),
                key=lambda i: -abs(i.contribution_score))

            total_pull = sum(pulls.values()) or 1.0
            modality_contributions = {m: round(pulls[m] / total_pull, 4) for m in MODALITIES}
            probabilities = {}
            scoring_details = {
                "model_kind": "early_fusion",
                "decision_threshold": round(float(threshold), 4),
                # Said explicitly because the shares mean something different
                # here: not "this modality's own verdict", but how much of the
                # model's reasoning rested on that modality's measurements.
                "contribution_basis": "share of the single model's feature contributions",
                "distribution_warnings": distribution_warnings,
            }
        else:
            # Each model is fed its own columns, by name.
            x_text = select(dict(zip(TEXT_COLS, text_raw)), text_cols)
            x_audio = select(audio_map, audio_cols)
            probabilities = {
                "text": _predict_proba(text_bundle, x_text),
                "audio": _predict_proba(audio_bundle, x_audio),
            }

            x_video = None
            if video_bundle is not None:
                video_map = openface_map() if video_extractor == "openface" else mediapipe_map()
                x_video = select(video_map, video_cols)
                probabilities["video"] = _predict_proba(video_bundle, x_video)

            p_final = _predict_proba(
                fusion_bundle, np.array([probabilities[m] for m in fusion_inputs]))
            threshold = fusion_bundle.threshold

            # Real modality contributions: the fusion model's learned
            # coefficients times this session's actual probabilities, not a
            # fixed split. A modality the fusion model does not take reports 0,
            # which the report renders as "Not used" rather than as a finding.
            fusion_coef = fusion_bundle.model.coef_[0]
            pulls = {m: abs(fusion_coef[i] * probabilities[m]) for i, m in enumerate(fusion_inputs)}
            total_pull = sum(pulls.values()) or 1.0
            modality_contributions = {
                m: round(pulls.get(m, 0.0) / total_pull, 4) for m in MODALITIES
            }

            for bundle, x, cols, modality in ((text_bundle, x_text, text_cols, "text"),
                                              (audio_bundle, x_audio, audio_cols, "audio"),
                                              (video_bundle, x_video, video_cols, "video")):
                if bundle is None:
                    continue
                warning = _distance_from_training(bundle, x, cols, modality, session_id)
                if warning:
                    distribution_warnings.append(warning)

            # Only a linear pipeline of the standard shape can be attributed
            # feature by feature. A missing explanation is better than a failed
            # report.
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

            bundles = {"text": text_bundle, "audio": audio_bundle, "video": video_bundle}
            scoring_details = {
                "model_kind": "late_fusion",
                "decision_threshold": round(float(threshold), 4),
                "modality_probabilities": {m: round(p, 4) for m, p in probabilities.items()},
                "modality_thresholds": {m: round(float(bundles[m].threshold), 4) for m in probabilities},
                "fusion_weights": {m: round(float(fusion_coef[i]), 4) for i, m in enumerate(fusion_inputs)},
                "distribution_warnings": distribution_warnings,
            }

        prediction = "depressed" if p_final >= threshold else "not_depressed"
        logger.info("Session %s: %s model, p=%s fused=%.4f threshold=%.4f -> %s", session_id,
                    scoring_details["model_kind"], {m: round(p, 4) for m, p in probabilities.items()},
                    p_final, threshold, prediction)

        return ProcessResponse(
            prediction=prediction,
            confidence_score=round(p_final, 4),
            explanation=explanation,
            modality_contributions=modality_contributions,
            scoring_details=scoring_details,
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
