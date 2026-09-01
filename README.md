# Depression Detection Platform

A controlled research/clinical platform where an **approved counselor** records
participant consent, uploads or records a video interview, and gets an AI
(multimodal audio+text+video) prediction of depression with an explainability
breakdown. The counselor adds their own professional judgment (stored
separately from the AI result), and an **admin** reviews counselor access
requests and decides which completed, consented sessions become part of a
controlled research dataset for future model improvement.

**ML status:** real trained text, audio, and fusion models (from a separate
research project on the DAIC-WOZ dataset) are wired in and loadable —
see "Real model integration" below. The video model is intentionally not
used (the research team's own testing found it makes the fused prediction
worse). Two feature-extraction functions are still stubbed pending the
original research project's exact extraction scripts — see
`ml-service/PENDING_FROM_FRIEND.md`. Until then, `ml-service` runs its
**mock** pipeline by default (`USE_REAL_MODELS=false`), which mirrors the
real inference architecture stage-by-stage and implements the exact API
contract the real pipeline uses — no backend/frontend changes are needed
either way.

## Stack

- **Frontend:** React + Vite, plain REST calls via axios
- **Backend:** Spring Boot 3 (Java 17, Maven), Spring Web, Spring Data JPA, Spring Security (JWT, role-based), Flyway
- **Database:** PostgreSQL (via docker-compose)
- **ML service:** Python FastAPI (mock for now)

## Design

A single shared stylesheet (`frontend/src/index.css`) defines the whole
visual system as CSS custom properties + utility classes reused across every
page — a deliberate "clinical calm" identity (deep teal accent, warm neutral
background, restrained red reserved for genuine errors) rather than a generic
SaaS palette, fitting a mental-health clinical tool. Responsive breakpoints at
~640px/~1024px/~1440px widen the content area and reflow grids/headers for
laptop and desktop screens; every interactive element has a visible
`:focus-visible` state for keyboard navigation.

## ML inference architecture (mocked, but structured for a real swap-in)

```
video ─┬─> app/modalities/audio.py  (run_audio_pipeline)  ─┐
       ├─> app/modalities/text.py   (run_text_pipeline)   ─┼─> app/fusion.py (fuse) ─> prediction, confidence,
       └─> app/modalities/video.py  (run_video_pipeline)  ─┘                            modality_contributions,
                                                                                          explanation[]
```

`app/mock_inference.py` is the orchestrator called by the unchanged `/process`
route in `main.py`; it just calls the three stage functions then `fuse()`.
**Only the body of each stage function needs to change** when real models
arrive — signatures, the FastAPI route, and the backend/frontend contract stay
the same. Video's mock output is deliberately coarse (no invented named visual
features) since the real video model's feature set hasn't been provided yet.

## Real model integration

Trained text/audio/fusion models (SVM, Logistic Regression, Logistic
Regression respectively — full detail in each model's `INFO.txt`/`RESULTS.txt`
under `friend_shared_work/`) are wired in behind `app/real/`, running side by
side with the mock:

```
video ─> app/real/media_pipeline.py            ffmpeg extract -> faster-whisper transcribe (word timestamps)
              │                                  -> pyannote.audio diarize -> identify participant vs counselor
              v
       app/real/text_features.py  (STUB)  ──> model1 (text, SVM)   ─┐
       app/real/audio_features.py (STUB)  ──> model2 (audio, LogReg)─┼─> model4 (fusion, LogReg) ─> prediction
                                                                      │    (model3/video and model5 intentionally
                                                                      │     unused — see PENDING_FROM_FRIEND.md)
```

**Status**: model loading, the full media pipeline (audio extraction,
transcription, diarization, participant identification), and the
fusion/response assembly are real and working. The two feature-extraction
functions are stubs (`NotImplementedError`) pending the original research
project's exact scripts — see `ml-service/PENDING_FROM_FRIEND.md` for the
full checklist. Guessing those formulas was deliberately avoided: getting a
sentence-embedding aggregation order wrong wouldn't error, it would silently
mispredict.

### Enabling it

```bash
USE_REAL_MODELS=true
HF_TOKEN=<your Hugging Face access token>   # see below
```

then start `ml-service` as usual. With `USE_REAL_MODELS=false` (default),
behavior is unchanged from the mock.

### One-time setup this needs

- **ffmpeg**: bundled at `ml-service/tools/` (downloaded, not committed —
  see `.gitignore`). Must be the **shared** build (`ffmpeg-*-full_build-shared`,
  not "essentials"): `torchcodec` (pulled in by the diarization pipeline
  below) dynamically loads FFmpeg's shared libraries (`avcodec-*.dll` etc.)
  at runtime, which a static-only build doesn't provide. Override the exe
  path with `FFMPEG_PATH` if you'd rather use a system install (make sure
  its DLL directory is on `PATH` too).
- **Speaker diarization (`HF_TOKEN`)**: recordings capture both the
  counselor and participant, but the models were trained on the
  participant's speech only, so diarization is required to separate them.
  `pyannote.audio`'s pretrained diarization model is gated on Hugging Face —
  create a free account, then accept the terms for **both**
  [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
  (the model actually used — newer and more accurate than 3.1) and
  [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0)
  (an internal dependency of it), generate an access token at
  huggingface.co/settings/tokens (Read-only is enough), and set `HF_TOKEN` to
  it — either as a real env var or in `ml-service/.env` (gitignored; copy
  `.env.example` to start). This is the one manual step that can't be
  automated for you.
- **`WHISPER_MODEL_SIZE`** (default `small`): faster-whisper model size —
  larger is more accurate but slower; downloads automatically on first use.
- Also pin `pydantic-core==2.46.4` alongside `pydantic` (already in
  `requirements.txt`) — some of the ML packages above pull in a newer
  `pydantic-core` transitively otherwise, and pydantic refuses to import if
  the two don't match exactly.

### Participant identification (a documented assumption)

After diarization, `media_pipeline.identify_participant_speaker()` assumes
the participant is whichever speaker talks more in total — typical for an
interview where the counselor asks short questions and the participant
answers at length. Documented in that function's docstring as the one place
to revisit if real recordings don't fit that pattern.

## Roles: ADMIN and COUNSELOR

There is no self-registration. A prospective counselor submits a **Request
Counselor Access** application (professional info + verification documents);
no login account exists until an **admin approves** it. Rejected/suspended
counselors get a clear message on login attempt — there's no separate
unauthenticated "check my status" endpoint (would leak which emails have
applied). Admins are seeded directly.

Backend authorization is enforced by URL pattern in `SecurityConfig`
(`/api/admin/**` → `ROLE_ADMIN`, `/api/sessions/**` → `ROLE_COUNSELOR`) plus
ownership checks in the service layer (a counselor can only ever see their own
sessions) — not by hiding frontend buttons.

## Participants (repeat interviews, DAIC-WOZ-style grouping)

New Session asks whether the participant is new or returning; returning picks
from a dropdown of the counselor's own prior participants. Behind that, every
session belongs to a `Participant` row (`SessionService.createSession` →
`ParticipantService.findOrCreate`), and video storage is grouped by
participant on disk: `uploads/{participantId}/{sessionId}/video.ext` instead
of one flat folder per session — so a participant's repeat sessions live
together, matching how DAIC-WOZ organizes multi-session participants. This is
also literally the research storage (there's no separate export location), so
it satisfies the same grouping need for admin's dataset review.

Participants are scoped **per-counselor** (two counselors using the same
`participant_ref` string get two separate `Participant` rows) — consistent
with the rule that counselors never see each other's data. The admin dataset
view's "group by participant" toggle instead clusters by the plain
`participantRef` string across all counselors, since admin already has
unrestricted visibility.

## Participant consent and the research dataset

Before upload, a counselor records four consent flags per session (recording,
AI analysis, storage, research reuse — the latter optional). All four consents
are stored with the session; only `research_reuse=false` excludes a session
from ever entering the research dataset — it does **not** block AI processing.
*(The consent text shown in `NewSession.jsx` is explicitly placeholder
copy, flagged in the UI — real legal/ethical wording needs separate review.)*

A completed session becomes a `dataset_samples` row automatically, sitting in
`AWAITING_JUDGMENT` → `UNDER_REVIEW` (once the counselor submits their
judgment) → `APPROVED`/`REJECTED` (admin's decision) — or `EXCLUDED_NO_CONSENT`
permanently if research-reuse consent was withheld. Nothing is auto-included;
admin makes the final call in `/admin/dataset`.

The counselor's own professional assessment (`counselor_judgments`) is stored
**separately** from the AI prediction (`reports.prediction`) and never
overwrites it — the Report page shows both side by side with a computed
AGREE/DISAGREE badge.

## Architecture

```
┌────────────┐   REST (JSON/multipart)   ┌──────────────┐   REST (JSON)   ┌─────────────┐
│  Frontend  │ ───────────────────────▶ │   Backend    │ ──────────────▶│ ML service  │
│  React/Vite│ ◀─────────────────────── │ Spring Boot  │ ◀────────────── │  FastAPI    │
│  :5173     │        JWT bearer         │    :8080     │   /process      │   :8000     │
└────────────┘                           └──────┬───────┘                 └─────────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼                         ▼
                              PostgreSQL              uploads/ (local disk)
                               :5433                  {participantId}/{sessionId}/video.ext
```

Request flow for a new interview: counselor uploads via the frontend → backend
stores the video and creates a `sessions` row (status `UPLOADED`) → an
`@Async` job (`SessionProcessingService`) flips it to `PROCESSING`, calls the
ML service's `/process`, and on response writes `reports` +
`explanation_factors` and flips to `COMPLETED` (or `FAILED` on error) → the
frontend polls session status and renders the report once done.

Everything downstream of that — counselor judgment, dataset eligibility,
admin review, audit logging — hangs off the same `sessions`/`reports` rows;
see the sections below for each of those pipelines. `GlobalExceptionHandler`
is the single place every domain exception (auth, validation, file, rate
limit, not-found) gets mapped to an HTTP status; nothing else writes error
responses directly.

## Security

- **Auth**: stateless JWT (`Authorization: Bearer`), BCrypt password hashing,
  role-based authorization enforced by URL pattern in `SecurityConfig` *and*
  ownership checks in the service layer (never just hidden frontend buttons).
- **Secrets**: `JWT_SECRET` and DB credentials come from env vars with dev-only
  fallbacks locally; the `prod` Spring profile (`application-prod.yml`) has
  **no fallback** for any of them — the app refuses to start without them set.
  See "Production readiness" below.
- **Rate limiting**: an in-memory sliding-window limiter
  (`RateLimitFilter`) throttles `POST /api/auth/login` and
  `POST /api/counselor-applications` per client IP (defaults: 10 / 15 min and
  5 / 15 min — see `app.rate-limit.*` in `application.yml`).
- **File upload validation**: `FileStorageService` allowlists both extension
  and content-type for videos (`.mp4/.webm/.mov/.avi`) and verification
  documents (`.pdf/.jpg/.jpeg/.png/.doc/.docx`), with separate size caps
  (`app.uploads.video-max-bytes` / `document-max-bytes`) — the stored filename
  extension always comes from that allowlist, never directly from the
  client-supplied filename, closing off a path-traversal vector.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  a baseline `Content-Security-Policy`, `Referrer-Policy`, and HSTS (a
  no-op until served over HTTPS) are set explicitly in `SecurityConfig`.
- **Error handling**: `GlobalExceptionHandler`'s catch-all logs the full
  exception server-side and returns only a generic message to the client —
  no internal detail (stack traces, SQL errors, file paths) is ever exposed
  in an HTTP response.
- **Password policy**: counselor-chosen passwords require 8+ characters
  (`CounselorApplicationController`).

### Known trade-offs (not fixed here, documented deliberately)

- **JWT lives in `localStorage`**, not an httpOnly cookie — simpler for a
  REST API consumed by a separate frontend origin, but readable by any script
  that achieves XSS. Moving to httpOnly cookies would require reintroducing
  CSRF protection and reworking the document-download flow (which currently
  authenticates via the `Authorization` header). A reasonable next step for a
  real deployment, not done in this pass.
- **TLS termination** isn't something this repo can set up — it's a deployment
  concern. Run this behind a reverse proxy (nginx, Caddy, a cloud load
  balancer) that terminates HTTPS; the HSTS header is already in place for
  when that's true.
- **Rate limiting is in-memory**, so it's per-instance. Fine for a single
  backend process; a multi-instance deployment would move this state to
  Redis or push it to an API gateway instead.

## Production readiness

What's handled: JWT/DB secrets required (not defaulted) under the `prod`
profile, demo-account seeding disabled by default under `prod`, rate limiting,
upload validation, sanitized error responses, security headers, RBAC enforced
server-side, audit logging on sensitive actions, consent-gated research data
handling. What's explicitly out of scope here: the real trained ML models
(still training separately — see "ML inference architecture" above), TLS
termination, and moving JWT off `localStorage` (see trade-offs above).

To run with production settings:

```bash
SPRING_PROFILES_ACTIVE=prod \
JWT_SECRET=<random 256-bit+ value> \
DB_URL=jdbc:postgresql://<host>:<port>/<db> \
DB_USERNAME=<user> DB_PASSWORD=<password> \
CORS_ALLOWED_ORIGINS=https://your-frontend-domain \
./mvnw spring-boot:run
```

### Environment variables (backend)

Local values go in `backend/.env` (gitignored — copy `backend/.env.example`).
Spring imports that file automatically; real environment variables override it.

| Variable | Required in `prod`? | Purpose |
|---|---|---|
| `JWT_SECRET` | Yes | JWT signing key |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | Yes | Postgres connection |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated allowed frontend origin(s) |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Yes | Operator admin account, seeded on first startup. There is no admin signup. |
| `ADMIN_NAME` | No | Display name for that account |
| `ML_ADMIN_TOKEN` | Yes | Shared secret for the ML service's `/internal/*` endpoints. Must match `ML_ADMIN_TOKEN` in `ml-service/.env`. |
| `MODELS_DIR` | No (default `../ml-service/models`) | Where uploaded model weights are written. **The backend and ML service must both see this directory** — a shared volume when containerised. |
| `FRONTEND_BASE_URL` | Yes | Used to build password-reset links |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | No | SMTP for password-reset email. Leave `MAIL_HOST` blank and reset links are written to the log instead of sent. For Gmail, `MAIL_PASSWORD` must be an App Password. |
| `SEED_DEMO_DATA` | No (forced `false` under `prod`) | Seed demo counselor/admin on startup |
| `DEMO_COUNSELOR_PASSWORD`, `DEMO_ADMIN_PASSWORD` | No | Override the dev-default seeded passwords |
| `ML_SERVICE_URL` | No (default `http://localhost:8000`) | Base URL of the ML service |

## Managing model weights (retraining loop)

Admin → **Models**. This is what makes retraining deployable without a code
change: train elsewhere on GPU, upload the `.joblib`, activate it.

1. **Upload** a bundle for one stage (text / audio / fusion).
2. The backend stores it and asks the ML service to **inspect** it —
   Java can't read a scikit-learn joblib, so validation happens in Python
   (`POST /internal/validate-model`).
3. The upload is **rejected** unless the model's input width matches the stage
   (text 3096, audio 85, fusion 2) and the bundle carries a `threshold`.
   This check is the point of the whole flow: a mis-shaped model still loads and
   still returns a probability — it just returns a meaningless one. A rejected
   file is deleted and never recorded.
4. **Activate** flips the active row, rewrites `ml-service/models/active_manifest.json`,
   and calls `POST /internal/reload-models`. New sessions use the new weights
   immediately; existing reports are untouched.
5. **Rollback** = activate an earlier version. **Revert to built-in** returns a
   stage to the weights that shipped with the project, for when a bad upload has
   no earlier version to fall back to.

A stage with no active row falls back to its shipped default, so a fresh install
works with no manifest at all.

> **⚠️ Uploading a model executes code.** A `.joblib` is a Python pickle, and
> loading one runs whatever it contains inside the ML service process. Model
> upload is therefore equivalent to remote code execution on that host. It is
> restricted to authenticated `ADMIN` users for exactly that reason — treat
> admin accounts as fully trusted, and never widen this endpoint's access. The
> ML service should also not be reachable from the public internet; the
> `ML_ADMIN_TOKEN` is defence in depth, not the only defence.

## The data lifecycle

What is kept, for how long, and why — the design that makes retraining and
privacy compatible rather than opposed.

| Artifact | Retained | Why |
|---|---|---|
| Raw recording | **Deleted after `VIDEO_RETENTION_DAYS`** (default 30) | Most sensitive artifact, least necessary to keep long-term |
| Transcript (participant speech) | Indefinitely | Clinical record; also usable for retraining |
| Feature vectors (3096 text + 85 audio) | Indefinitely | **This is what makes video deletion possible** — a training set can be rebuilt from these without ever touching the recording |
| Report + counselor assessment | Indefinitely | The clinical output |
| Audit log | Indefinitely, including after erasure | An untraceable erasure would be worse than none |

Feature vectors are captured at processing time and stored as JSONB. Without
them, building a training set from real sessions would mean re-running ffmpeg,
Whisper, diarization and sentence embedding over every archived recording —
which would force the video to be kept forever.

### Dataset export

Admin → **Dataset** → *Export approved dataset*. Produces a ZIP:

- `features.csv` — one row per session: `session_id`, `label`, then
  `text_0..3095` and `audio_0..84`, in the models' exact input order.
- `metadata.csv` — human-readable context, including what the model predicted
  and whether the counselor agreed.
- `README.txt` — what was included, what was skipped and why, and how to handle it.

**The label is the counselor's own assessment, never the model's prediction.**
Training on the model's output would only teach a new model to reproduce the
current one's mistakes. The rows where the counselor *disagreed* with the model
are the most informative in the file.

A session is exportable only if all three hold: the participant consented to
research reuse and has not withdrawn it; an administrator approved the sample;
and a counselor recorded an assessment.

### Privacy operations

Admin → **Privacy**.

- **Retention sweep** — runs nightly (`VIDEO_RETENTION_CRON`), triggerable manually.
- **Withdraw consent** (per session) — removes it from the research dataset and
  marks it. The clinical record is retained.
- **Erase participant** — destroys sessions, recordings, transcripts, feature
  vectors, reports and assessments. Irreversible; requires typing the
  participant reference to confirm. An audit entry recording that the erasure
  happened is deliberately kept.

| Variable | Default | Purpose |
|---|---|---|
| `VIDEO_RETENTION_ENABLED` | `true` | Turn the nightly sweep off entirely |
| `VIDEO_RETENTION_DAYS` | `30` | Age at which recordings are deleted |
| `VIDEO_RETENTION_CRON` | `0 15 3 * * *` | When the sweep runs (03:15 daily) |

## Prerequisites

- Java 17+
- Node.js 18+
- Python 3.10+ for the mock pipeline; **Python 3.11** specifically if you'll
  run `USE_REAL_MODELS=true` — scikit-learn/torch/etc. don't yet ship
  prebuilt wheels for very new Python versions (3.11 does, reliably)
- Docker Desktop (for Postgres only)

## 1. Start Postgres

```bash
docker compose up -d
```

Starts Postgres on `localhost:5433` (db `depression_db`, user `depression_user`,
password `depression_pass`). Port 5433 instead of the default 5432 because this
machine already has a native PostgreSQL install bound to 5432. Flyway applies
the schema automatically on backend startup (`backend/src/main/resources/db/migration/`).

## 2. Start the ML service

```bash
cd ml-service
py -3.11 -m venv venv          # Python 3.11 specifically — see Prerequisites
./venv/Scripts/pip install -r requirements.txt   # venv/bin/pip on macOS/Linux
./venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok","real_models":false}`

Runs the mock pipeline by default. To use the real trained models instead,
see "Real model integration" above — set `USE_REAL_MODELS=true` (and
`HF_TOKEN` for diarization) before starting.

## 3. Start the backend

```bash
cd backend
./mvnw spring-boot:run
```

Runs on `http://localhost:8080`. On first startup (when `app.seed-demo-data`
is `true`, the local-dev default) it seeds one pre-approved demo counselor
account and one demo admin account. Passwords come from the
`DEMO_COUNSELOR_PASSWORD` / `DEMO_ADMIN_PASSWORD` env vars if set, otherwise a
dev-only default — **the credentials themselves are intentionally not printed
in this file** (a real login page, and a public repo, shouldn't advertise
valid passwords). The backend logs the seeded credentials to its own console
on first startup; that's the source of truth for your local login.

## 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

- Log in as the demo **counselor** → New Session → participant reference →
  consent step → upload/record → watch it process → Report page (prediction,
  modality contributions, explainability, your professional judgment).
- Log in as the demo **admin** → Overview (stats) → Access Requests (approve/
  reject/suspend counselor applications submitted at `/request-access`) →
  Dataset (review sessions for research-dataset inclusion).

## Repo layout

```
depression-detection-platform/
├── backend/       # Spring Boot API
├── frontend/      # React (Vite) UI
├── ml-service/    # FastAPI ML service — mock and real, behind USE_REAL_MODELS
│   ├── models/      # the 3 trained .joblib files actually used (text, audio, fusion)
│   ├── tools/        # ffmpeg (downloaded, gitignored — see "Real model integration")
│   ├── PENDING_FROM_FRIEND.md   # what's still needed from the research project
│   └── app/
│       ├── modalities/, fusion.py, mock_inference.py   # mock pipeline (unchanged)
│       └── real/
│           ├── model_loader.py     # loads the 3 joblib bundles
│           ├── media_pipeline.py   # ffmpeg -> Whisper -> diarization -> participant isolation
│           ├── text_features.py, audio_features.py   # STUBS — see PENDING_FROM_FRIEND.md
│           └── real_inference.py   # real orchestrator, mirrors mock_inference.py's shape
├── friend_shared_work/   # original model handoff package (gitignored, local reference only)
├── uploads/       # Uploaded video files + verification documents (not in DB)
└── docker-compose.yml   # Postgres only
```

## Notes / decisions made without explicit spec

- **No registration endpoint** for counselors in the old sense — replaced by
  the access-request/approval workflow. Counselor accounts are only created in
  the `users` table at *approval* time (not at application time), so a
  pending/rejected/suspended applicant literally cannot log in.
- **Dataset eligibility statuses**: `EXCLUDED_NO_CONSENT`, `AWAITING_JUDGMENT`,
  `UNDER_REVIEW`, `APPROVED`, `REJECTED` — not explicitly specified, chosen to
  make the consent → data → judgment → admin-review pipeline traceable.
- **Webcam recording** (via `MediaRecorder`) is implemented alongside file
  upload on the New Session page.
- Explanation factors are displayed sorted by `|contribution_score|`
  descending, tagged with the modality (audio/text) they came from.
- Audit logging is explicit `AuditLogService.log(...)` calls at each sensitive
  action site (application approve/reject/suspend, session create, judgment
  submit, dataset view/approve/reject) — viewable via `/api/admin/audit-logs`.
