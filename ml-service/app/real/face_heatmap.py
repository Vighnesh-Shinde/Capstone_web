"""
Face heat maps: the video part of an early-fusion score, painted on three
moments of the participant's own face.

WHAT THIS IS, AND WHY IT IS NOT CALLED GRAD-CAM
-----------------------------------------------
Grad-CAM weights a convolutional network's feature maps by the gradient of the
class score, which needs a network that reads pixels. The serving model reads
OpenFace's measurements instead: 14 muscle intensities, 6 muscle-presence rates
and gaze, summarised over the session. So there is no gradient over pixels to
take. What there is, is better defined: the model's exact SHAP value for every
one of those measurements (real_inference._early_fusion_blocks). This module
puts those values back where the muscles are:

    push_m      = SHAP of every column of muscle m, summed, kept only when it
                  points toward the reported outcome (Grad-CAM's ReLU)
    activity_mf = how active muscle m is in frame f, 0..1 against this session
    heat        = sum over m of push_m x (0.4 + 0.6 x activity_mf), as a
                  Gaussian over the landmarks OpenFace tracked for muscle m

The frames shown are the ones where the face most expressed what the model
weighed: in each third of the session, the frame maximising
sum over m of push_m x z_mf, where z is that frame's standardised intensity.

The report labels it "Grad-CAM-style", never Grad-CAM.

PRIVACY
-------
Three small JPEG crops of the face are stored inside the report, because the
recording itself is deleted after processing. They go wherever the report goes:
erasure deletes them, and the research export never reads report details.
"""

from __future__ import annotations

import base64
import logging
import subprocess

import numpy as np

from app.real.openface_features import (
    AU_INTENSITY, FACE_REGIONS, LANDMARKS_X, LANDMARKS_Y, OpenFaceResult,
)

logger = logging.getLogger("ml-service")

N_FRAMES = 3
OUTPUT_SIZE = 256          # px, square
JPEG_QUALITY = 82
MAX_OVERLAY_ALPHA = 0.55
# Gaussian width as a fraction of the distance between the outer eye corners.
SIGMA_OF_INTEROCULAR = 0.16
# A muscle drawn when inactive in a frame still shows its session-level push.
ACTIVITY_FLOOR = 0.4

# Landmarks per muscle, 68-point iBUG indices. A tuple is a synthetic point at
# the mean of those landmarks, for places the layout has no point, such as the cheeks.
MUSCLE_POINTS: dict[str, list] = {
    "AU01": [20, 21, 22, 23],                        # inner brow raiser
    "AU02": [17, 18, 25, 26],                        # outer brow raiser
    "AU04": [19, 20, 21, 22, 23, 24, 27],            # brow lowerer
    "AU05": [37, 38, 43, 44],                        # upper lid raiser
    "AU45": [37, 38, 40, 41, 43, 44, 46, 47],        # blink
    "AU06": [(2, 31, 40), (14, 35, 47)],             # cheek raiser
    "AU09": [27, 28, 31, 35],                        # nose wrinkler
    "AU10": [50, 51, 52, 33],                        # upper lip raiser
    "AU12": [48, 54],                                # lip corner puller
    "AU14": [48, 54],                                # dimpler
    "AU15": [48, 54, 59, 55],                        # lip corner depressor
    "AU20": [48, 54, (48, 4), (54, 12)],             # lip stretcher
    "AU23": [61, 62, 63, 65, 66, 67],                # lip tightener
    "AU25": [62, 66],                                # lips part
    "AU26": [7, 8, 9, 57],                           # jaw drop
    "AU28": [56, 57, 58],                            # lip suck
    "AU17": [8, (8, 57)],                            # chin raiser
    "gaze": [(36, 37, 38, 39, 40, 41), (42, 43, 44, 45, 46, 47)],
}


def _muscle_of(column: str) -> str | None:
    if column.startswith("gz_"):
        return None if column.endswith("frac_tracked") else "gaze"
    key = column[:4]
    return key if key in MUSCLE_POINTS else None


def _region_name(muscle: str) -> str:
    return "gaze direction" if muscle == "gaze" else FACE_REGIONS.get(muscle, "other")


def _activity(frames, muscle: str) -> np.ndarray:
    """0..1 per frame: intensity against this session's own 95th percentile."""
    if muscle == "gaze":
        return np.ones(len(frames))
    column = f"{muscle}_r" if f"{muscle}_r" in AU_INTENSITY else f"{muscle}_c"
    if column not in frames.columns:
        return np.zeros(len(frames))
    values = frames[column].to_numpy(float)
    values = np.where(values < 0, 0.0, values)       # -100 is "not tracked"
    if column.endswith("_c"):
        return np.clip(values, 0.0, 1.0)
    ceiling = max(float(np.percentile(values, 95)), 0.5)
    return np.clip(values / ceiling, 0.0, 1.0)


def _points(row, spec) -> np.ndarray:
    xs = row[LANDMARKS_X].to_numpy(float)
    ys = row[LANDMARKS_Y].to_numpy(float)
    out = []
    for p in spec:
        idx = list(p) if isinstance(p, tuple) else [p]
        out.append((xs[idx].mean(), ys[idx].mean()))
    return np.array(out)


def _grab_frame(video_path: str, seconds: float, size: tuple[int, int]):
    """
    One still from the recording, scaled exactly as the clip OpenFace tracked,
    so the landmarks land on it.
    """
    import cv2

    from app.real.media_pipeline import FFMPEG_PATH
    from app.real.openface_features import MAX_WIDTH

    run = subprocess.run(
        [FFMPEG_PATH, "-v", "error", "-ss", f"{seconds:.3f}", "-i", str(video_path),
         "-frames:v", "1", "-vf", f"scale='min({MAX_WIDTH},iw)':-2",
         "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True, timeout=60,
    )
    if run.returncode != 0 or not run.stdout:
        return None
    image = cv2.imdecode(np.frombuffer(run.stdout, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    if (image.shape[1], image.shape[0]) != tuple(size):
        image = cv2.resize(image, tuple(size), interpolation=cv2.INTER_AREA)
    return image


def _render(image, row, pushes: dict[str, float], activity_row: dict[str, float],
            peak: float) -> tuple[bytes, dict[str, float]]:
    """Heat over one frame, cropped square around the face. Returns JPEG and per-region heat."""
    import cv2

    h, w = image.shape[:2]
    xs = row[LANDMARKS_X].to_numpy(float)
    ys = row[LANDMARKS_Y].to_numpy(float)
    interocular = float(np.hypot(xs[45] - xs[36], ys[45] - ys[36])) or 30.0
    sigma = max(SIGMA_OF_INTEROCULAR * interocular, 2.0)

    impulses = np.zeros((h, w), np.float32)
    region_heat: dict[str, float] = {}
    for muscle, push in pushes.items():
        amplitude = push * (ACTIVITY_FLOOR + (1 - ACTIVITY_FLOOR) * activity_row[muscle])
        if amplitude <= 0:
            continue
        points = _points(row, MUSCLE_POINTS[muscle])
        # Split across the muscle's points, so a muscle with many landmarks is
        # not drawn hotter than one with two.
        for x, y in points:
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < w and 0 <= yi < h:
                impulses[yi, xi] += amplitude / len(points)
        region = _region_name(muscle)
        region_heat[region] = region_heat.get(region, 0.0) + amplitude

    # A blurred impulse peaks at 1 / (2 pi sigma^2); undo that so heat is in the
    # same units as the pushes, whatever size the face is on screen.
    heat = cv2.GaussianBlur(impulses, (0, 0), sigma) * (2 * np.pi * sigma ** 2)
    level = np.clip(heat / peak, 0.0, 1.0)
    colour = cv2.applyColorMap((level * 255).astype(np.uint8), cv2.COLORMAP_JET)
    alpha = (MAX_OVERLAY_ALPHA * np.clip(level * 1.8, 0.0, 1.0))[..., None]
    blended = (image * (1 - alpha) + colour * alpha).astype(np.uint8)

    # Square crop around the face, padded where the face is near the edge.
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    side = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.45)
    padded = cv2.copyMakeBorder(blended, side, side, side, side, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    x0, y0 = int(cx - side / 2) + side, int(cy - side / 2) + side
    crop = padded[y0:y0 + side, x0:x0 + side]
    crop = cv2.resize(crop, (OUTPUT_SIZE, OUTPUT_SIZE), interpolation=cv2.INTER_AREA)
    ok, jpeg = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise ValueError("JPEG encoding failed")
    return jpeg.tobytes(), region_heat


def _peak_heat(image_shape, row, pushes, activity_row) -> float:
    """The hottest value a frame would reach, to put all frames on one scale."""
    import cv2

    h, w = image_shape
    xs = row[LANDMARKS_X].to_numpy(float)
    ys = row[LANDMARKS_Y].to_numpy(float)
    sigma = max(SIGMA_OF_INTEROCULAR * (float(np.hypot(xs[45] - xs[36], ys[45] - ys[36])) or 30.0), 2.0)
    impulses = np.zeros((h, w), np.float32)
    for muscle, push in pushes.items():
        amplitude = push * (ACTIVITY_FLOOR + (1 - ACTIVITY_FLOOR) * activity_row[muscle])
        points = _points(row, MUSCLE_POINTS[muscle])
        for x, y in points:
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < w and 0 <= yi < h and amplitude > 0:
                impulses[yi, xi] += amplitude / len(points)
    return float((cv2.GaussianBlur(impulses, (0, 0), sigma) * (2 * np.pi * sigma ** 2)).max())


def build_face_heatmap(video_path: str, openface: OpenFaceResult, video_parts,
                       towards_depressed: bool) -> dict | None:
    """
    Heat maps for the report, or None when there is nothing honest to draw:
    no tracked frames, or no facial measurement pushing toward the outcome.

    video_parts: (column, SHAP contribution, standardised value) for every
    video column, as real_inference builds them.
    """
    frames = openface.frames
    if frames is None or len(frames) < N_FRAMES or not all(c in frames.columns for c in LANDMARKS_X):
        return None

    sign = 1.0 if towards_depressed else -1.0
    shap_by_muscle: dict[str, float] = {}
    for column, contribution, _ in video_parts:
        muscle = _muscle_of(column)
        if muscle:
            shap_by_muscle[muscle] = shap_by_muscle.get(muscle, 0.0) + float(contribution)
    pushes = {m: max(sign * v, 0.0) for m, v in shap_by_muscle.items()}
    pushes = {m: v for m, v in pushes.items() if v > 1e-6}
    if not pushes:
        return None

    activity = {m: _activity(frames, m) for m in pushes}
    evidence = np.zeros(len(frames))
    for muscle, push in pushes.items():
        a = activity[muscle]
        evidence += push * (a - a.mean()) / (a.std() + 1e-6)

    times = frames["timestamp"].to_numpy(float)
    edges = np.linspace(times.min(), times.max(), N_FRAMES + 1)
    chosen = []
    for i in range(N_FRAMES):
        inside = np.where((times >= edges[i]) & (times <= edges[i + 1]))[0]
        if inside.size:
            chosen.append(int(inside[np.argmax(evidence[inside])]))
    chosen = sorted(set(chosen))

    stills = []
    for index in chosen:
        image = _grab_frame(video_path, times[index], openface.frame_size)
        if image is None:
            continue
        row = frames.iloc[index]
        activity_row = {m: float(activity[m][index]) for m in pushes}
        stills.append((index, image, row, activity_row))
    if not stills:
        return None

    peak = max(_peak_heat(image.shape[:2], row, pushes, act) for _, image, row, act in stills) or 1.0
    out_frames = []
    for index, image, row, activity_row in stills:
        jpeg, region_heat = _render(image, row, pushes, activity_row, peak)
        total = sum(region_heat.values()) or 1.0
        strongest = [r for r, v in sorted(region_heat.items(), key=lambda kv: -kv[1])
                     if v / total >= 0.1][:3]
        out_frames.append({
            "time_s": round(float(times[index]), 1),
            "image": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii"),
            "regions": strongest,
        })

    logger.info("Face heat maps: %d frames, muscles drawn: %s", len(out_frames),
                ", ".join(sorted(pushes)))
    return {
        "method": "shap_on_landmarks",
        "target": "depressed" if towards_depressed else "not depressed",
        "frames": out_frames,
    }
