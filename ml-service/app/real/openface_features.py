"""
Facial action units and gaze from OpenFace 2.2 — the features the DAIC-WOZ
video model (My_Work/models/video_model.joblib) was trained on.

WHY A SECOND VIDEO EXTRACTOR
----------------------------
video_features.py measures face geometry with MediaPipe, and that is what the
session record stores. But the DAIC-WOZ corpus ships OpenFace/CLNF output, so a
model trained on it can only be fed OpenFace numbers — MediaPipe landmarks mean
something different even where the names look alike. This module runs the
OpenFace binary on the recording and reproduces
My_Work/training_scripts/extract_video_official.py: the same frame filter, the
same statistics, the same column names.

WHAT DOES NOT MATCH EXACTLY — stated so nobody assumes otherwise
----------------------------------------------------------------
1. Version. DAIC-WOZ was processed with an early OpenFace/CLNF build; this is
   OpenFace 2.2 (2019). Its CLNF landmark model is used — the family DAIC-WOZ
   used, rather than 2.2's default CE-CLM — but the action-unit regressors were
   retrained between releases, so intensities are close to the corpus's, not
   identical.
2. Action units. 2.2 predicts 17 intensities and 18 presence flags; the corpus
   has 14 and 6. Only the corpus's are used — including in au_total, which
   would otherwise be inflated by three muscles the model never saw.
3. Head-frame gaze. The corpus has gaze in camera coordinates (x_0 .. z_1) and
   in head coordinates (x_h0 .. z_h1). 2.2 writes only the first. The second is
   derived here from the head pose OpenFace reports, as R(pose) · g with
   OpenFace's Euler convention R = Rx · Ry · Rz.

   Verified on the corpus itself, which ships camera-frame gaze, head-frame
   gaze AND head pose: across all 188 participants, R · g reproduces the
   native head-frame columns to a mean error of 0.011 (max 0.26); the
   transpose, R^T · g, is off by 0.23 (max 1.98). A sweep over Euler orders,
   transpose and angle sign found no better convention. It is still not exact
   (a residual of ~0.01 remains), so CLNF's internal gaze transform differs
   slightly from this one.

   One assumption remains: that OpenFace 2.2 reports head pose in the same
   convention as the CLNF build that produced the corpus. Both come from the
   same author and document the same R = Rx · Ry · Rz, but the corpus test
   above could only check CLNF's numbers, not 2.2's.
4. Frame rate. The movement features are frame-to-frame differences, so they
   scale with frame rate. DAIC-WOZ video is 30 fps, so every recording is
   resampled to 30 fps first; otherwise a 60 fps phone video would halve every
   movement number.

PRIVACY
-------
OpenFace writes per-frame landmarks to a temporary folder, which is deleted as
soon as the summary numbers exist. Only the 224 session statistics leave this
module, and they cannot reconstruct a face.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

import numpy as np

logger = logging.getLogger("ml-service")

_DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent / "tools" / "OpenFace_2.2.0_win_x64"
OPENFACE_BIN = Path(os.environ.get("OPENFACE_BIN", str(_DEFAULT_DIR / "FeatureExtraction.exe")))

# CLNF, not 2.2's default CE-CLM: it is the landmark model DAIC-WOZ was
# processed with, and it ships inside the release zip, whereas CE-CLM's patch
# experts are a separate download.
LANDMARK_MODEL = "model/main_clnf_general.txt"

# From extract_video_official.py: frames below this are treated as untracked.
MIN_CONFIDENCE = 0.75
TARGET_FPS = 30
# Downscaled before tracking. OpenFace's cost grows with resolution while the
# landmarks it feeds the action-unit models do not improve past this.
MAX_WIDTH = int(os.environ.get("OPENFACE_MAX_WIDTH", "640"))
TIMEOUT_SECONDS = int(os.environ.get("OPENFACE_TIMEOUT_SECONDS", "3000"))

# The corpus's columns, in the corpus's order (CLNF_AUs.txt / CLNF_gaze.txt).
AU_INTENSITY = [
    "AU01_r", "AU02_r", "AU04_r", "AU05_r", "AU06_r", "AU09_r", "AU10_r",
    "AU12_r", "AU14_r", "AU15_r", "AU17_r", "AU20_r", "AU25_r", "AU26_r",
]
AU_PRESENCE = ["AU04_c", "AU12_c", "AU15_c", "AU23_c", "AU28_c", "AU45_c"]
GAZE = ["x_0", "y_0", "z_0", "x_1", "y_1", "z_1",
        "x_h0", "y_h0", "z_h0", "x_h1", "y_h1", "z_h1"]

_STATS = ("mean", "std", "p10", "p50", "p90", "max")


def _columns() -> list[str]:
    cols = ["au_frac_tracked"]
    for c in AU_INTENSITY:
        cols += [f"{c}_{s}" for s in _STATS] + [f"{c}_d_mean", f"{c}_d_std"]
    cols += [f"{c}_rate" for c in AU_PRESENCE]
    cols += [f"au_total_{s}" for s in _STATS] + ["au_total_d_mean", "au_total_d_std"]
    cols.append("gz_frac_tracked")
    for g in GAZE:
        cols += [f"gz_{g}_{s}" for s in _STATS] + [f"gz_{g}_d_mean", f"gz_{g}_d_std"]
    return cols


OPENFACE_COLS = _columns()
assert len(OPENFACE_COLS) == 224


class OpenFaceError(Exception):
    """OpenFace features could not be produced for this recording."""


# --------------------------------------------------------------------------
# Ported verbatim from My_Work/training_scripts/extract_video_official.py
# --------------------------------------------------------------------------
def _stats(x, name: str) -> dict[str, float]:
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if x.size < 5:
        return {f"{name}_{s}": np.nan for s in _STATS}
    p10, p50, p90 = np.percentile(x, [10, 50, 90])
    return {f"{name}_mean": float(x.mean()), f"{name}_std": float(x.std()),
            f"{name}_p10": float(p10), f"{name}_p50": float(p50),
            f"{name}_p90": float(p90), f"{name}_max": float(x.max())}


def _delta_stats(x, name: str) -> dict[str, float]:
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if x.size < 6:
        return {f"{name}_d_mean": np.nan, f"{name}_d_std": np.nan}
    d = np.abs(np.diff(x))
    return {f"{name}_d_mean": float(d.mean()), f"{name}_d_std": float(d.std())}


# --------------------------------------------------------------------------
def _rotation_matrices(rx, ry, rz) -> np.ndarray:
    """
    OpenFace's Euler2RotationMatrix (RotationHelpers.h): R = Rx · Ry · Rz,
    vectorised over frames. Shape (n, 3, 3).
    """
    s1, s2, s3 = np.sin(rx), np.sin(ry), np.sin(rz)
    c1, c2, c3 = np.cos(rx), np.cos(ry), np.cos(rz)
    R = np.empty((len(rx), 3, 3))
    R[:, 0, 0] = c2 * c3
    R[:, 0, 1] = -c2 * s3
    R[:, 0, 2] = s2
    R[:, 1, 0] = c1 * s3 + c3 * s1 * s2
    R[:, 1, 1] = c1 * c3 - s1 * s2 * s3
    R[:, 1, 2] = -c2 * s1
    R[:, 2, 0] = s1 * s3 - c1 * c3 * s2
    R[:, 2, 1] = c3 * s1 + c1 * s2 * s3
    R[:, 2, 2] = c1 * c2
    return R


def _corpus_gaze(frames) -> dict[str, np.ndarray]:
    """OpenFace 2.2 gaze columns renamed and extended to the corpus's twelve."""
    out = {}
    R = _rotation_matrices(frames["pose_Rx"].to_numpy(float),
                           frames["pose_Ry"].to_numpy(float),
                           frames["pose_Rz"].to_numpy(float))
    for eye in (0, 1):
        g = frames[[f"gaze_{eye}_x", f"gaze_{eye}_y", f"gaze_{eye}_z"]].to_numpy(float)
        # R · g, per frame. NOT R^T · g, which is what the rotation algebra
        # suggests and what this line first did: tested against the corpus's
        # own head-frame columns across all 188 participants, R^T · g was off by
        # 0.23 on average (max 1.98); R · g by 0.011 (max 0.26). See point 3 of
        # the module docstring.
        head = np.einsum("nij,nj->ni", R, g)
        for axis, i in (("x", 0), ("y", 1), ("z", 2)):
            out[f"{axis}_{eye}"] = g[:, i]
            out[f"{axis}_h{eye}"] = head[:, i]
    return out


def summarise(frames) -> tuple[dict[str, float], int]:
    """
    Per-frame OpenFace output -> the 224 session features, plus the number of
    frames that passed the tracking filter. Split out from the subprocess so it
    can be tested against a CSV without running OpenFace.
    """
    frames = frames.rename(columns=lambda c: c.strip())
    ok = (frames["success"] == 1) & (frames["confidence"] >= MIN_CONFIDENCE)
    good = frames[ok]

    rec: dict[str, float] = {"au_frac_tracked": float(ok.mean()) if len(ok) else 0.0}
    for c in AU_INTENSITY:
        rec.update(_stats(good[c], c))
        rec.update(_delta_stats(good[c], c))
    for c in AU_PRESENCE:
        v = good[c].replace(-100, np.nan)            # the corpus's not-tracked sentinel
        rec[f"{c}_rate"] = float(v.mean(skipna=True)) if v.notna().any() else np.nan
    total = good[AU_INTENSITY].sum(axis=1)
    rec.update(_stats(total, "au_total"))
    rec.update(_delta_stats(total, "au_total"))

    rec["gz_frac_tracked"] = rec["au_frac_tracked"]  # one tracker, one filter
    gaze = _corpus_gaze(good)
    for g in GAZE:
        rec.update(_stats(gaze[g], f"gz_{g}"))
        rec.update(_delta_stats(gaze[g], f"gz_{g}"))
    return rec, int(ok.sum())


def available() -> bool:
    return OPENFACE_BIN.exists()


def compute_openface_features(video_path: str) -> dict[str, float]:
    """
    Run OpenFace on a recording and return its session features by name.

    Raises OpenFaceError when OpenFace is missing, fails, or finds too little
    face to measure. The caller decides whether that matters: it only does when
    the active fusion model takes video.
    """
    import pandas as pd

    from app.real.media_pipeline import FFMPEG_PATH

    if not available():
        # The path goes to the log only; the message can reach a counsellor's screen.
        logger.error("OpenFace FeatureExtraction not found at %s", OPENFACE_BIN)
        raise OpenFaceError(
            "The facial-analysis tool (OpenFace) is not installed on this server. "
            "This is a server configuration problem — please contact your administrator."
        )

    with tempfile.TemporaryDirectory(prefix="openface_") as tmp:
        clip = Path(tmp) / "face.mp4"
        convert = subprocess.run(
            [FFMPEG_PATH, "-v", "error", "-y", "-i", str(video_path), "-an",
             "-vf", f"fps={TARGET_FPS},scale='min({MAX_WIDTH},iw)':-2",
             "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", str(clip)],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
        if convert.returncode != 0 or not clip.exists():
            raise OpenFaceError(
                "The recording's video track could not be read, so the face could not "
                "be analysed. It may be an audio-only file."
            )

        out_dir = Path(tmp) / "out"
        run = subprocess.run(
            [str(OPENFACE_BIN), "-f", str(clip), "-out_dir", str(out_dir),
             "-aus", "-gaze", "-pose", "-mloc", str(OPENFACE_BIN.parent / LANDMARK_MODEL), "-q"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS, cwd=str(OPENFACE_BIN.parent),
        )
        csv_path = out_dir / "face.csv"
        if run.returncode != 0 or not csv_path.exists():
            logger.error("OpenFace failed (%s): %s", run.returncode, (run.stdout + run.stderr)[-2000:])
            raise OpenFaceError("Facial analysis failed on this recording.")

        frames = pd.read_csv(csv_path)

    features, tracked = summarise(frames)
    if tracked < 5:
        raise OpenFaceError(
            f"No usable face was found in this recording (only {tracked} of {len(frames)} "
            f"frames were tracked confidently). The participant may be off camera or in "
            f"poor light."
        )
    logger.info("OpenFace: %d of %d frames tracked (%.0f%%).",
                tracked, len(frames), 100.0 * tracked / max(len(frames), 1))
    return features


# One worker: OpenFace is CPU-heavy, and two sessions tracking faces at once
# would each take twice as long rather than finishing sooner.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="openface")


def start(video_path: str) -> Future:
    """
    Begin OpenFace in the background and return a Future for its features.

    Started before transcription so the two overlap: OpenFace is a separate
    process, and waiting for speech recognition to finish before starting it
    would add its whole running time to every session.
    """
    return _executor.submit(compute_openface_features, video_path)
