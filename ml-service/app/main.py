import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.internal_admin import router as internal_router
from app.mock_inference import run_inference
from app.schemas import ProcessRequest, ProcessResponse

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


@app.post("/process", response_model=ProcessResponse)
def process(request: ProcessRequest) -> ProcessResponse:
    if not USE_REAL_MODELS:
        return run_inference(request.session_id, request.video_path)

    from app.languages import LanguageNotScorable
    from app.real.real_inference import run_real_inference
    try:
        return run_real_inference(request.session_id, request.video_path, request.language)
    except LanguageNotScorable as e:
        # 422, not 500: the request was well formed and the service is healthy.
        # This is a refusal with a reason, and the reason is worth showing the
        # counselor verbatim rather than collapsing into "processing failed".
        raise HTTPException(status_code=422, detail=str(e))
    except NotImplementedError as e:
        # Feature extraction stubs not filled in yet — see PENDING_FROM_FRIEND.md.
        # Mapped to 503 (not 500): this is a known, temporary "not ready" state,
        # not an unexpected server error.
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Real inference failed for session %s", request.session_id)
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
