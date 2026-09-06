"""
Facial-geometry features for the participant, from the session video.

WHY THIS EXISTS
---------------
The research plan is to delete the original recording once the data derived
from it is safely stored. That only works if everything a future model could
need has already been extracted — and video features are the part that had no
extractor at all. Deleting the video first and adding the extractor later
would mean the source data is gone and can never be recovered.

WHAT IS MEASURED
----------------
Not pixels. The geometry of a face and how much it moves: mouth width and
opening, eye aperture, brow-to-eye distance, jaw width, nose-to-chin, and the
frame-to-frame movement of each. This mirrors the approach of the research
project's own video model, which read 68-point OpenFace/CLNF landmarks.

Every distance is normalised by the inter-ocular distance — the span between
the outer eye corners — so a participant sitting closer to or further from the
camera does not change the numbers. Without that, "leaned forward" and
"opened their mouth wider" are indistinguishable.

A DELIBERATE INCOMPATIBILITY, STATED PLAINLY
--------------------------------------------
These features come from MediaPipe Face Mesh, not OpenFace. They are NOT
interchangeable with the research project's video_comprehensive.joblib — the
landmark sets differ, so the numbers mean different things even where the
names match. That model cannot score these features and this extractor cannot
feed it.

The reason for choosing MediaPipe anyway: OpenFace is a C++ binary needing a
separate build and model download, and the alternative to "self-consistent
features starting now" was "no video features at all, and the recordings
deleted regardless". These features are for the models trained from THIS
platform's own sessions (see the training scripts), where self-consistency is
what matters and compatibility with a model trained on a different corpus is
not.

PRIVACY
-------
Landmarks are geometry, not imagery. Nothing here can reconstruct a face, and
no frame is retained — the extractor holds one frame at a time and keeps only
running measurements.
"""

import logging
import math
import os
from pathlib import Path

import numpy as np

logger = logging.getLogger("ml-service")

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "mediapipe" / "face_landmarker.task"

# Frames per second to sample. The face does not change meaningfully between
# consecutive frames at 30fps, and sampling every frame of a 40-minute session
# costs many minutes of CPU for measurements that barely differ. 5fps still
# resolves speech-rate mouth movement.
SAMPLE_FPS = float(os.environ.get("VIDEO_SAMPLE_FPS", "5"))

# Landmark indices in MediaPipe's 478-point Face Mesh.
# Named rather than inlined because a bare integer in a distance calculation is
# unreviewable — nobody can tell 263 from 362 by eye.
L_EYE_OUTER, L_EYE_INNER = 33, 133
R_EYE_INNER, R_EYE_OUTER = 362, 263
L_EYE_TOP, L_EYE_BOTTOM = 159, 145
R_EYE_TOP, R_EYE_BOTTOM = 386, 374
L_BROW, R_BROW = 105, 334
MOUTH_LEFT, MOUTH_RIGHT = 61, 291
LIP_TOP_OUTER, LIP_BOTTOM_OUTER = 0, 17
LIP_TOP_INNER, LIP_BOTTOM_INNER = 13, 14
JAW_LEFT, JAW_RIGHT = 172, 397
NOSE_TIP, CHIN = 1, 152

# Landmarks grouped by region, for the split between mouth movement (speech
# articulation) and upper-face movement (brow and eye expression).
MOUTH_REGION = [61, 291, 0, 17, 13, 14, 78, 308, 82, 87, 312, 317]
UPPER_REGION = [105, 334, 159, 145, 386, 374, 33, 133, 362, 263, 70, 300]

# The per-frame measurements. Order is fixed and must not change: it defines
# the column order of every stored feature vector, and a reordering would
# silently invalidate every row already in the database.
GEOMETRY_NAMES = [
    "mouth_width",
    "mouth_open_outer",
    "mouth_open_inner",
    "left_eye_aperture",
    "right_eye_aperture",
    "eye_aperture_mean",
    "left_eye_width",
    "right_eye_width",
    "left_brow_raise",
    "right_brow_raise",
    "brow_raise_mean",
    "jaw_width",
    "nose_to_chin",
]

# Summary statistics applied to each measurement across the session.
FUNCTIONAL_NAMES = ["mean", "std", "p10", "p50", "p90", "range"]


def _feature_columns() -> list[str]:
    columns: list[str] = []
    for name in GEOMETRY_NAMES:
        for functional in FUNCTIONAL_NAMES:
            columns.append(f"vid_{name}_{functional}")
    # Movement: how much each measurement changes between sampled frames.
    for name in GEOMETRY_NAMES:
        columns.append(f"vid_{name}_delta_mean")
        columns.append(f"vid_{name}_delta_std")
    columns += [
        "vid_motion_overall_mean",
        "vid_motion_overall_std",
        "vid_motion_mouth_mean",
        "vid_motion_upper_mean",
        # Ratio of mouth movement to upper-face movement. Speech drives the
        # mouth; expression drives the brow and eyes. A face that moves only
        # to talk looks different from one that also reacts.
        "vid_motion_mouth_upper_ratio",
        # Data quality, carried as features rather than hidden: a vector from
        # 40 usable frames deserves less weight than one from 4,000, and a
        # model can only account for that if it is told.
        "vid_frames_used",
        "vid_frames_face_ratio",
    ]
    return columns


VIDEO_COLS = _feature_columns()
N_VIDEO_FEATURES = len(VIDEO_COLS)


class VideoFeatureError(Exception):
    """Video features could not be extracted. Never fatal to a session."""


def _distance(landmarks, a: int, b: int) -> float:
    ax, ay = landmarks[a].x, landmarks[a].y
    bx, by = landmarks[b].x, landmarks[b].y
    return math.hypot(ax - bx, ay - by)


def _geometry(landmarks) -> np.ndarray | None:
    """One frame's measurements, scale-normalised. None if the face is degenerate."""
    # Inter-ocular distance: the reference length everything else is divided
    # by. If it is ~0 the detection is nonsense (a profile view, or a false
    # positive on something that is not a face).
    interocular = _distance(landmarks, L_EYE_OUTER, R_EYE_OUTER)
    if interocular < 1e-6:
        return None

    def d(a, b):
        return _distance(landmarks, a, b) / interocular

    left_eye = d(L_EYE_TOP, L_EYE_BOTTOM)
    right_eye = d(R_EYE_TOP, R_EYE_BOTTOM)
    left_brow = d(L_BROW, L_EYE_TOP)
    right_brow = d(R_BROW, R_EYE_TOP)

    return np.array([
        d(MOUTH_LEFT, MOUTH_RIGHT),
        d(LIP_TOP_OUTER, LIP_BOTTOM_OUTER),
        d(LIP_TOP_INNER, LIP_BOTTOM_INNER),
        left_eye,
        right_eye,
        (left_eye + right_eye) / 2.0,
        d(L_EYE_OUTER, L_EYE_INNER),
        d(R_EYE_INNER, R_EYE_OUTER),
        left_brow,
        right_brow,
        (left_brow + right_brow) / 2.0,
        d(JAW_LEFT, JAW_RIGHT),
        d(NOSE_TIP, CHIN),
    ], dtype=float)


def _region_centroid(landmarks, indices, interocular: float) -> np.ndarray:
    points = np.array([[landmarks[i].x, landmarks[i].y] for i in indices], dtype=float)
    return points / max(interocular, 1e-6)


def compute_video_features(video_path: str) -> np.ndarray:
    """
    A fixed-width feature vector for the face in a session recording.

    Raises VideoFeatureError when no usable face was found. The caller treats
    that as "this session has no video features", not as a failed session —
    a recording where the participant is off-camera or in the dark still has
    perfectly good audio and text.
    """
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    if not MODEL_PATH.exists():
        raise VideoFeatureError(
            f"The face landmark model is missing at {MODEL_PATH}. See the README "
            f"section on video features for how to download it."
        )

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise VideoFeatureError(f"Could not open the video at {video_path}.")

    try:
        source_fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(1, int(round(source_fps / SAMPLE_FPS)))

        options = vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
        )

        geometries: list[np.ndarray] = []
        mouth_motion: list[float] = []
        upper_motion: list[float] = []
        overall_motion: list[float] = []
        previous_mouth = previous_upper = None

        examined = 0
        frame_index = 0

        with vision.FaceLandmarker.create_from_options(options) as landmarker:
            while True:
                ok = capture.grab()
                if not ok:
                    break
                if frame_index % step != 0:
                    frame_index += 1
                    continue

                ok, frame = capture.retrieve()
                frame_index += 1
                if not ok:
                    continue
                examined += 1

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                # Monotonically increasing timestamps are required in VIDEO
                # mode; derived from the frame index so they stay consistent
                # regardless of how many frames were skipped.
                timestamp_ms = int((frame_index / max(source_fps, 1e-6)) * 1000)
                result = landmarker.detect_for_video(image, timestamp_ms)

                if not result.face_landmarks:
                    continue
                landmarks = result.face_landmarks[0]

                geometry = _geometry(landmarks)
                if geometry is None:
                    continue
                geometries.append(geometry)

                interocular = _distance(landmarks, L_EYE_OUTER, R_EYE_OUTER)
                mouth_points = _region_centroid(landmarks, MOUTH_REGION, interocular)
                upper_points = _region_centroid(landmarks, UPPER_REGION, interocular)

                if previous_mouth is not None:
                    mouth_delta = float(np.mean(np.linalg.norm(mouth_points - previous_mouth, axis=1)))
                    upper_delta = float(np.mean(np.linalg.norm(upper_points - previous_upper, axis=1)))
                    mouth_motion.append(mouth_delta)
                    upper_motion.append(upper_delta)
                    overall_motion.append((mouth_delta + upper_delta) / 2.0)

                previous_mouth, previous_upper = mouth_points, upper_points
    finally:
        capture.release()

    if len(geometries) < 5:
        raise VideoFeatureError(
            f"No usable face was found in this recording (only {len(geometries)} frames "
            f"with a detected face). The participant may be off camera, in darkness, or "
            f"the file may contain no video track."
        )

    matrix = np.vstack(geometries)
    values: list[float] = []

    for column in range(matrix.shape[1]):
        series = matrix[:, column]
        values.extend([
            float(np.mean(series)),
            float(np.std(series)),
            float(np.percentile(series, 10)),
            float(np.percentile(series, 50)),
            float(np.percentile(series, 90)),
            float(np.ptp(series)),
        ])

    deltas = np.abs(np.diff(matrix, axis=0)) if matrix.shape[0] > 1 else np.zeros((1, matrix.shape[1]))
    for column in range(matrix.shape[1]):
        values.append(float(np.mean(deltas[:, column])))
        values.append(float(np.std(deltas[:, column])))

    mouth_mean = float(np.mean(mouth_motion)) if mouth_motion else 0.0
    upper_mean = float(np.mean(upper_motion)) if upper_motion else 0.0
    values.extend([
        float(np.mean(overall_motion)) if overall_motion else 0.0,
        float(np.std(overall_motion)) if overall_motion else 0.0,
        mouth_mean,
        upper_mean,
        # Guarded: an utterly still upper face is rare but would otherwise
        # produce an infinity that poisons every downstream scaler.
        mouth_mean / upper_mean if upper_mean > 1e-9 else 0.0,
        float(len(geometries)),
        float(len(geometries)) / max(examined, 1),
    ])

    vector = np.array(values, dtype=float)
    if vector.shape[0] != N_VIDEO_FEATURES:
        # A mismatch means GEOMETRY_NAMES and the arithmetic above disagree,
        # which would silently misalign every column name from its value.
        raise VideoFeatureError(
            f"Internal error: produced {vector.shape[0]} video features, expected "
            f"{N_VIDEO_FEATURES}."
        )

    logger.info(
        "Video features: %d columns from %d frames with a face (%.0f%% of %d sampled).",
        N_VIDEO_FEATURES, len(geometries), 100.0 * len(geometries) / max(examined, 1), examined,
    )
    return vector
