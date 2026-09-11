import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.internal_admin import router as internal_router
from app.mock_inference import run_inference
from app.schemas import (
    EnrollVoiceRequest,
    EnrollVoiceResponse,
    ProcessRequest,
    ProcessResponse,
)

# Loads ml-service/.env if present (gitignored — see README "Real model
# integration"). Lets USE_REAL_MODELS/HF_TOKEN/etc. live in a local file
# instead of needing to be exported in every terminal session.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("ml-service")

USE_REAL_MODELS = os.environ.get("USE_REAL_MODELS", "false").lower() == "true"

app = FastAPI(title="Depression Detection ML Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Operator endpoints for model-weight management, called by the backend.
# Token-gated — see internal_admin.py.
app.include_router(internal_router)


@app.on_event("startup")
def preload_models() -> None:
    if not USE_REAL_MODELS:
        logger.info("USE_REAL_MODELS=false — running the mock pipeline.")
        return
    from app.real.model_loader import Models
    Models.preload_all()
    logger.info("USE_REAL_MODELS=true — real text/audio/fusion models loaded.")


@app.get("/health")
def health():
    return {"status": "ok", "real_models": USE_REAL_MODELS}


@app.get("/languages")
def languages():
    """
    Which languages can be transcribed, and which can actually be scored.

    Served from here rather than duplicated in the backend or the frontend, so
    there is exactly one place that knows the answer — and so activating a new
    language's models updates every screen at once. In mock mode every known
    language reports as scorable: nothing real is being computed either way,
    and pretending otherwise would make the mock unusable for UI work.
    """
    from app.languages import LANGUAGES, catalog
    from dataclasses import asdict

    if not USE_REAL_MODELS:
        return {"languages": [{**asdict(lang), "scoring": True} for lang in LANGUAGES]}
    return {"languages": catalog()}


@app.post("/enroll-voice", response_model=EnrollVoiceResponse)
def enroll_voice(request: EnrollVoiceRequest) -> EnrollVoiceResponse:
    """
    Turn a recording of one person reading the passage into a voiceprint.

    Returns ok=false with a readable reason rather than raising, because every
    failure mode here (too short, background voices, silence) is something the
    person can fix by recording again — an HTTP error code would make the
    frontend guess at wording the service already knows.

    Mock mode returns a deterministic pseudo-vector so the enrollment and
    session UI can be exercised without the real models. It is derived from the
    audio path, so the same "person" enrols consistently and two different ones
    never match.
    """
    if not USE_REAL_MODELS:
        import hashlib
        digest = hashlib.sha256(request.audio_path.encode()).digest()
        vector = [((b / 255.0) - 0.5) for b in digest]
        norm = sum(v * v for v in vector) ** 0.5 or 1.0
        return EnrollVoiceResponse(
            ok=True,
            embedding=[v / norm for v in vector],
            dimension=len(vector),
            speech_seconds=45.0,
        )

    from app.real.voiceprint import EnrollmentError, extract_voiceprint
    try:
        voiceprint = extract_voiceprint(request.audio_path)
    except EnrollmentError as e:
        return EnrollVoiceResponse(ok=False, error=str(e))
    except Exception as e:
        logger.exception("Voice enrollment failed for %s", request.audio_path)
        return EnrollVoiceResponse(
            ok=False,
            error=f"The recording could not be processed: {e}",
        )

    return EnrollVoiceResponse(
        ok=True,
        embedding=voiceprint.embedding,
        dimension=voiceprint.dimension,
        speech_seconds=voiceprint.speech_seconds,
    )


@app.post("/process", response_model=ProcessResponse)
def process(request: ProcessRequest) -> ProcessResponse:
    if not USE_REAL_MODELS:
        # The companion count is taken from the request so the mock's speaker
        # panel reflects who the counselor actually said was in the room.
        return run_inference(
            request.session_id,
            request.video_path,
            len(request.companion_embeddings or []),
        )

    from app.languages import LanguageNotScorable
    from app.real.adequacy import SessionTooShort
    from app.real.real_inference import VideoUnavailable
    from app.real.media_pipeline import SpeakerResolutionError
    from app.real.real_inference import run_real_inference
    try:
        return run_real_inference(
            request.session_id,
            request.video_path,
            request.language,
            counselor_embedding=request.counselor_embedding,
            companion_embeddings=request.companion_embeddings,
        )
    except VideoUnavailable as e:
        # The active fusion model needs a video probability and this recording
        # could not provide one. A refusal, not a crash: the counsellor can fix
        # it (face in frame) or the admin can switch fusion back to two inputs.
        raise HTTPException(
            status_code=422,
            detail={"code": "VIDEO_UNAVAILABLE", "message": str(e)},
        )
    except SessionTooShort as e:
        # 422 like the other refusals: the service is healthy and the request
        # was fine. The recording is simply outside what the models can score.
        raise HTTPException(
            status_code=422,
            detail={"code": "SESSION_TOO_SHORT", "message": str(e)},
        )
    except SpeakerResolutionError as e:
        # 422, like the language refusal: the service is healthy and the request
        # was well formed. The pipeline declined to guess whose voice to score,
        # and the reason is written for the counselor to act on.
        #
        # The detail is a structured object rather than a bare string so the
        # backend can tell the two kinds of refusal apart without matching on
        # English prose — they end the session in different states.
        raise HTTPException(
            status_code=422,
            detail={"code": "SPEAKER_UNRESOLVED", "message": str(e)},
        )
    except LanguageNotScorable as e:
        # 422, not 500: the request was well formed and the service is healthy.
        # This is a refusal with a reason, and the reason is worth showing the
        # counselor verbatim rather than collapsing into "processing failed".
        raise HTTPException(
            status_code=422,
            detail={"code": "LANGUAGE_NOT_SCORABLE", "message": str(e)},
        )
    except NotImplementedError as e:
        # Feature extraction stubs not filled in yet — see PENDING_FROM_FRIEND.md.
        # Mapped to 503 (not 500): this is a known, temporary "not ready" state,
        # not an unexpected server error.
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Real inference failed for session %s", request.session_id)
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
