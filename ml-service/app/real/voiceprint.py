"""
Speaker identification by enrolled voiceprint.

WHY THIS EXISTS
---------------
The audio model was trained on participant speech only. Everything downstream
therefore depends on correctly deciding which diarized speaker is the
participant — and until now that decision was a heuristic: whoever talks most.

That heuristic is inherited from DAIC-WOZ, where the interviewer is a virtual
agent asking short scripted questions, so the participant always talks more. It
does not survive contact with a real counselling room. A severely depressed
client gives one-word answers while the counselor carries the conversation, so
the counselor becomes the longest speaker and the pipeline scores *their* voice
and *their* words. The heuristic fails hardest on exactly the people the tool
exists to detect, and fails silently, producing a normal-looking report about
the wrong person.

So speakers are identified positively rather than by elimination. The counselor
enrolls their voice by reading a fixed passage; anyone else in the room at
session time (an interpreter, a family member) reads the same passage before
the interview starts. At analysis time every diarized speaker is matched
against those known voices, and the participant is the one who matches none of
them. If that does not resolve to exactly one person, the session is not
scored — see resolve_speakers().

WHY THE DIARIZATION PIPELINE IS USED FOR ENROLLMENT TOO
------------------------------------------------------
Embeddings are only comparable within one model's vector space. Rather than
load a separate speaker-embedding model and hope it is the same one the
diarizer uses internally, enrollment runs the whole diarization pipeline over
the enrollment recording and takes the resulting speaker centroid. That is
slower than it needs to be — around half a minute of CPU for a one-minute clip
— but it is same-space by construction, and it doubles as the quality check
that matters most: if the pipeline finds two speakers in a recording that was
supposed to be one person reading a passage, somebody else was talking, and
that voiceprint would be contaminated.

PRIVACY
-------
A voiceprint is biometric data about an identifiable person. Only the embedding
is kept; the enrollment recording is deleted as soon as the vector is
extracted, because a stored vector cannot be played back and a stored recording
can. The consequence is that changing the diarization model invalidates every
enrolled voiceprint and everyone must record again — acceptable, given they
re-record monthly regardless.
"""

import logging
import os
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger("ml-service")


# Cosine similarity above which two embeddings are treated as the same person.
#
# THIS DEFAULT IS A STARTING POINT, NOT A TUNED VALUE. It was chosen from the
# usual operating range for speaker-verification embeddings, not measured on
# this deployment's recordings, microphones or rooms. Whoever operates this
# platform should check it against real sessions before trusting it: too low
# and a participant gets mistaken for the counselor and dropped from their own
# report; too high and every session refuses to score.
MATCH_THRESHOLD = float(os.environ.get("VOICE_MATCH_THRESHOLD", "0.55"))

# How far ahead of the runner-up the best match must be. A speaker who looks
# 0.58 like the counselor and 0.56 like the participant's mother has not really
# been identified, and a bare threshold would call that a confident match.
MATCH_MARGIN = float(os.environ.get("VOICE_MATCH_MARGIN", "0.06"))

# Enrollment recordings shorter than this do not contain enough speech to
# characterise a voice. The passage takes roughly 45 seconds to read aloud, so
# anything under 12 seconds means it was cut short.
MIN_ENROLLMENT_SPEECH_SECONDS = 12.0


class EnrollmentError(Exception):
    """Enrollment audio unusable. The message is shown to the person recording."""


@dataclass
class Voiceprint:
    """One person's voice as a unit vector, plus how it was obtained."""

    embedding: list[float]
    speech_seconds: float
    dimension: int


def _l2_normalize(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm == 0.0:
        raise EnrollmentError(
            "The recording produced an empty voice profile. This usually means no "
            "speech was captured — check the microphone and record again."
        )
    return vector / norm


def cosine_similarity(a, b) -> float:
    """
    Similarity of two voiceprints, in [-1, 1].

    Both sides are re-normalised rather than assumed to be unit vectors: these
    embeddings make a round trip through JSON and a database column, and a
    silently denormalised vector would shift every score without erroring.
    """
    va = _l2_normalize(np.asarray(a, dtype=float))
    vb = _l2_normalize(np.asarray(b, dtype=float))
    return float(np.dot(va, vb))


def extract_voiceprint(wav_path: str) -> Voiceprint:
    """
    Turn an enrollment recording of one person into a voiceprint.

    Raises EnrollmentError with a message meant for the person who recorded it,
    not for a log file — every failure here is something they can fix by
    recording again, so the message has to say what went wrong.
    """
    from app.real.media_pipeline import diarize_with_embeddings

    labels, embeddings, turns = diarize_with_embeddings(wav_path)

    if embeddings is None:
        # Guarded rather than assumed: without embeddings the next line would
        # fail with a TypeError about NoneType subscripting, which tells the
        # person recording nothing they can act on and the operator nothing
        # about the actual cause.
        raise EnrollmentError(
            "This deployment's diarization pipeline does not return speaker embeddings, "
            "so voices cannot be enrolled. This is a server configuration problem, not "
            "a problem with your recording — please contact your administrator."
        )

    if not labels:
        raise EnrollmentError(
            "No speech was detected in this recording. Check that the microphone "
            "was working and that you were not muted, then record again."
        )

    speech_by_speaker: dict[str, float] = {}
    for start, end, speaker in turns:
        speech_by_speaker[speaker] = speech_by_speaker.get(speaker, 0.0) + (end - start)

    dominant = max(speech_by_speaker, key=speech_by_speaker.get)
    dominant_seconds = speech_by_speaker[dominant]
    total_seconds = sum(speech_by_speaker.values())

    # More than one speaker means the recording is contaminated. Taking the
    # dominant speaker anyway would enrol a voiceprint that is partly somebody
    # else — and this vector is about to be used to decide who is excluded from
    # a clinical prediction, so a quiet best-effort is the wrong instinct.
    if len(labels) > 1 and dominant_seconds < 0.9 * total_seconds:
        raise EnrollmentError(
            f"More than one voice was detected in this recording "
            f"({len(labels)} speakers). Please record again somewhere quiet, "
            f"with nobody else speaking."
        )

    if dominant_seconds < MIN_ENROLLMENT_SPEECH_SECONDS:
        raise EnrollmentError(
            f"Only {dominant_seconds:.0f} seconds of speech were detected, and at "
            f"least {MIN_ENROLLMENT_SPEECH_SECONDS:.0f} are needed. Please read the "
            f"whole passage at a normal pace."
        )

    index = labels.index(dominant)
    embedding = _l2_normalize(np.asarray(embeddings[index], dtype=float))

    logger.info(
        "Enrolled a voiceprint: %d dimensions from %.1fs of speech.",
        embedding.shape[0], dominant_seconds,
    )
    return Voiceprint(
        embedding=[float(v) for v in embedding],
        speech_seconds=round(dominant_seconds, 2),
        dimension=int(embedding.shape[0]),
    )


@dataclass
class SpeakerRoles:
    """Who is who in a session, and how confidently."""

    participant: str | None
    counselor: str | None
    # Diarized labels matched to a companion enrolled at session start.
    companions: list[str]
    # label -> {"counselor": 0.71, "companion:1": 0.12, ...}
    similarities: dict[str, dict[str, float]]
    resolved: bool
    reason: str | None


def resolve_speakers(
    labels: list[str],
    embeddings,
    counselor_embedding,
    companion_embeddings: list | None = None,
) -> SpeakerRoles:
    """
    Assign a role to every diarized speaker using the enrolled voices.

    Each diarized speaker is scored against the counselor and every companion.
    A speaker is claimed by the best-scoring known voice, provided that score
    clears MATCH_THRESHOLD and beats the runner-up by MATCH_MARGIN. Whoever is
    left unclaimed is the participant.

    Resolution FAILS — rather than falling back to a guess — when:

      * the counselor cannot be found in their own session recording, or
      * nobody is left over to be the participant, or
      * more than one unidentified voice is present.

    Every one of those means the recording is not what it was expected to be,
    and the whole point of this module is that scoring the wrong person is a
    worse outcome than declining to score. The caller keeps the transcript and
    reports the reason; see real_inference.
    """
    companion_embeddings = companion_embeddings or []

    known: list[tuple[str, object]] = [("counselor", counselor_embedding)]
    for i, emb in enumerate(companion_embeddings):
        known.append((f"companion:{i}", emb))

    similarities: dict[str, dict[str, float]] = {}
    claims: dict[str, str] = {}          # diarized label -> role
    unclaimed: list[str] = []

    for index, label in enumerate(labels):
        scores = {
            role: cosine_similarity(embeddings[index], reference)
            for role, reference in known
        }
        similarities[label] = {role: round(score, 4) for role, score in scores.items()}

        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best_role, best_score = ranked[0]
        runner_up = ranked[1][1] if len(ranked) > 1 else -1.0

        if best_score >= MATCH_THRESHOLD and (best_score - runner_up) >= MATCH_MARGIN:
            claims[label] = best_role
        else:
            unclaimed.append(label)

    # Two diarized clusters can both look like the counselor when the diarizer
    # over-splits one person (a change of tone, a phone call). Keeping only the
    # strongest claim returns the weaker cluster to the unclaimed pool, where
    # it will correctly trip the "more than one unidentified voice" check
    # rather than silently deleting half of somebody's speech.
    for role in {r for r in claims.values()}:
        matching = [label for label, r in claims.items() if r == role]
        if len(matching) > 1:
            best = max(matching, key=lambda label: similarities[label][role])
            for label in matching:
                if label != best:
                    del claims[label]
                    unclaimed.append(label)

    counselor_label = next((label for label, r in claims.items() if r == "counselor"), None)
    companion_labels = [label for label, r in claims.items() if r.startswith("companion:")]

    def failure(reason: str) -> SpeakerRoles:
        return SpeakerRoles(
            participant=None, counselor=counselor_label, companions=companion_labels,
            similarities=similarities, resolved=False, reason=reason,
        )

    if counselor_label is None:
        return failure(
            "The counselor's enrolled voice was not found in this recording. Either a "
            "different counselor conducted the interview, the audio quality is too poor "
            "to match a voice, or the wrong file was uploaded."
        )

    if not unclaimed:
        return failure(
            "Every voice in this recording matched a known speaker, leaving nobody to be "
            "the participant. The recording may contain only the counselor, or the "
            "participant may have been enrolled as a companion by mistake."
        )

    if len(unclaimed) > 1:
        return failure(
            f"{len(unclaimed)} unidentified voices are present. Everyone in the room "
            f"besides the participant must record the passage before the interview, so "
            f"their speech can be separated from the participant's."
        )

    return SpeakerRoles(
        participant=unclaimed[0], counselor=counselor_label, companions=companion_labels,
        similarities=similarities, resolved=True, reason=None,
    )
