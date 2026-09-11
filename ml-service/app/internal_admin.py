"""
Operator-only endpoints used by the Spring Boot backend to manage model weights.

These are NOT public API. They exist because model validation has to happen
where the models can actually be loaded: the backend is Java and cannot read a
scikit-learn joblib, so it delegates inspection here.

Access is gated on a shared secret (ML_ADMIN_TOKEN) sent by the backend. In a
real deployment the ML service should additionally not be reachable from the
public internet at all — the token is defence in depth, not the only defence.

    SECURITY: /internal/validate-model unpickles the file it is given, and
    unpickling executes arbitrary code. Anything that can reach this endpoint
    with a valid token can run code in this process. See model_loader.py.
"""

import logging
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("ml-service")

router = APIRouter(prefix="/internal", tags=["internal"])


def _expected_token() -> str:
    """
    Read the secret on each call rather than at import time.

    main.py imports this module before it calls load_dotenv(), so a value
    captured at import would always be empty when the token comes from
    ml-service/.env rather than a real environment variable.
    """
    return os.environ.get("ML_ADMIN_TOKEN", "")


class ValidateModelRequest(BaseModel):
    path: str
    modality: str


class ValidateModelResponse(BaseModel):
    ok: bool
    feature_count: int | None = None
    expected_feature_count: int | None = None
    threshold: float | None = None
    has_cols: bool = False
    n_cols: int | None = None
    model_repr: str | None = None
    error: str | None = None


def _require_token(token: str | None) -> None:
    expected = _expected_token()
    if not expected:
        # Fail closed. An unset secret must not mean "no authentication
        # required" — that would leave the endpoint wide open by default.
        raise HTTPException(
            status_code=503,
            detail="ML_ADMIN_TOKEN is not configured on the ML service; internal endpoints are disabled.",
        )
    # Constant-time comparison: a plain != leaks how much of the token matched
    # through timing, which is enough to reconstruct it byte by byte.
    if token is None or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal admin token.")


@router.post("/validate-model", response_model=ValidateModelResponse)
def validate_model(
    request: ValidateModelRequest,
    x_ml_admin_token: str | None = Header(default=None),
) -> ValidateModelResponse:
    """
    Inspect an uploaded .joblib without activating it.

    Returns ok=False with a human-readable reason rather than raising, so the
    backend can surface exactly why a file was rejected to the admin who
    uploaded it.
    """
    _require_token(x_ml_admin_token)

    from app.real.feature_space import model_columns
    from app.real.model_loader import FUSION_INPUT_WIDTHS, UPLOADABLE_MODALITIES, inspect_bundle

    modality = request.modality.lower()
    expected = None
    if modality not in UPLOADABLE_MODALITIES:
        return ValidateModelResponse(
            ok=False,
            error=f"Unknown modality '{request.modality}'. Expected one of: "
                  f"{', '.join(UPLOADABLE_MODALITIES)}.",
        )

    path = Path(request.path)
    if not path.exists():
        return ValidateModelResponse(
            ok=False, expected_feature_count=expected,
            error=f"File not found at {path}. The backend and ML service must share this directory.",
        )

    try:
        info = inspect_bundle(path)
    except Exception as e:
        logger.warning("Rejected model upload at %s: %s", path, e)
        return ValidateModelResponse(
            ok=False, expected_feature_count=expected,
            error=f"Could not load this file as a model bundle: {e}",
        )

    actual = info["feature_count"]
    if actual is None:
        return ValidateModelResponse(
            ok=False, expected_feature_count=expected, **_carry(info),
            error="Could not determine the model's input width (no n_features_in_). "
                  "It may not be a fitted scikit-learn estimator.",
        )

    # Fusion is the one stage with two legitimate widths: [text, audio], or
    # [text, audio, video]. Anything else cannot be wired to the pipeline.
    if modality == "fusion":
        if actual in FUSION_INPUT_WIDTHS:
            expected = actual
        else:
            return ValidateModelResponse(
                ok=False, expected_feature_count=expected, **_carry(info),
                error=f"A fusion model must take 2 inputs [p_text, p_audio] or 3 inputs "
                      f"[p_text, p_audio, p_video], in that order. This one takes {actual}.",
            )

    else:
        # Checked by column NAME, not width: every input the model names must be
        # something this platform measures. Width alone cannot tell two
        # different 224-column feature sets apart. See feature_space.py.
        try:
            expected = len(model_columns(modality, info["cols"], actual))
        except ValueError as e:
            return ValidateModelResponse(
                ok=False, expected_feature_count=expected, **_carry(info),
                error=f"{e} Activating it would produce meaningless predictions.",
            )

    if info["threshold"] is None:
        return ValidateModelResponse(
            ok=False, expected_feature_count=expected, **_carry(info),
            error="Bundle has no 'threshold' key. The decision threshold is tuned during "
                  "training and must ship with the model.",
        )

    return ValidateModelResponse(ok=True, expected_feature_count=expected, **_carry(info))


def _carry(info: dict) -> dict:
    """Echo the inspected metadata back regardless of pass/fail, so a rejection
    still tells the admin what the file actually contained."""
    return {
        "feature_count": info["feature_count"],
        "threshold": info["threshold"],
        "has_cols": info["has_cols"],
        "n_cols": info["n_cols"],
        "model_repr": info["model_repr"],
    }


@router.post("/reload-models")
def reload_models(x_ml_admin_token: str | None = Header(default=None)) -> dict:
    """Re-read the manifest and swap in whatever is now marked active."""
    _require_token(x_ml_admin_token)

    from app.real.model_loader import Models

    try:
        active = Models.reload()
    except Exception as e:
        logger.exception("Model reload failed")
        # The previously loaded models are still in place — reload() only swaps
        # the cache once every model has loaded successfully.
        raise HTTPException(
            status_code=500,
            detail=f"Reload failed; the previously active models are still serving. {e}",
        )

    logger.info("Models reloaded: %s", active)
    return {"status": "reloaded", "active": active}


@router.get("/active-models")
def active_models(x_ml_admin_token: str | None = Header(default=None)) -> dict:
    _require_token(x_ml_admin_token)
    from app.real.model_loader import Models
    return {"active": Models.active_files()}
