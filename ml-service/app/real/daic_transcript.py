"""
Writes session transcripts in the DAIC-WOZ corpus format.

The point is that a session recorded on this platform and a session from the
original corpus should be loadable by the same script, so real sessions can be
appended to a training set without a bespoke parser. That means matching the
format exactly, not approximately:

    start_time<TAB>stop_time<TAB>speaker<TAB>value<CRLF>

  * Tab-separated, despite the .csv extension. The corpus files are named
    *_TRANSCRIPT.csv and contain tabs; that is a quirk of the original release
    and copying it is the whole objective.
  * CRLF line endings, as in the released files.
  * Times in seconds with three decimal places.
  * Text lowercased with punctuation stripped, because the corpus is
    transcribed that way and a model trained on both would otherwise see
    "Yes." and "yes" as different tokens.

ONE DELIBERATE DIFFERENCE
-------------------------
The interviewer is labelled "Counselor", not "Ellie". Ellie is the virtual
agent used to collect DAIC-WOZ and was never in these rooms; writing her name
into a record of a real clinical conversation would be a lie in a file meant
for research. Nothing downstream breaks, because the interviewer's turns are
what training scripts discard — the honest text model is defined by keeping
only rows where speaker == "Participant", and those rows are byte-identical in
shape to the corpus.

Companions (an interpreter, a family member) are labelled "Companion 1",
"Companion 2", and so on. The corpus has no equivalent, but dropping their
speech entirely would silently misrepresent the interview, and merging it into
the participant's would poison exactly the signal being measured.
"""

import re
import unicodedata

HEADER = "start_time\tstop_time\tspeaker\tvalue"

PARTICIPANT_LABEL = "Participant"
COUNSELOR_LABEL = "Counselor"


def normalize_text(text: str) -> str:
    """
    Lowercase, strip punctuation, collapse whitespace — DAIC-WOZ style.

    Apostrophes are kept, because the corpus keeps them ("i don't judge",
    "i'm a computer"); stripping them would split contractions into tokens no
    model trained on the corpus has ever seen. Unicode is folded to ASCII
    apostrophes first so a curly quote from a transcriber does not survive as a
    different character.
    """
    folded = unicodedata.normalize("NFKC", text)
    folded = folded.replace("’", "'").replace("‘", "'")
    lowered = folded.lower()
    # Keep letters, digits, apostrophes and spaces. Tabs and newlines in
    # particular must not survive: either would break the row apart.
    cleaned = re.sub(r"[^a-z0-9' ]+", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def build_transcript(transcript) -> str:
    """
    Render a DiarizedTranscript as DAIC-WOZ text.

    Segments are emitted in chronological order across all speakers, which is
    how the corpus reads — the file is a conversation, not a per-speaker
    grouping. Segments whose text normalises to nothing (a cough Whisper
    rendered as "...") are dropped rather than written as empty rows, since a
    row with an empty value would parse as a turn where nobody said anything.
    """
    roles: dict[str, str] = {}
    if transcript.participant_speaker:
        roles[transcript.participant_speaker] = PARTICIPANT_LABEL
    if transcript.counselor_speaker:
        roles[transcript.counselor_speaker] = COUNSELOR_LABEL
    for index, label in enumerate(transcript.companion_speakers or [], start=1):
        roles[label] = f"Companion {index}"

    lines = [HEADER]
    for segment in sorted(transcript.segments, key=lambda s: s.start):
        value = normalize_text(segment.text)
        if not value:
            continue
        # A diarized cluster with no assigned role should not silently become a
        # participant row; "Unknown" keeps it visible and filterable.
        speaker = roles.get(segment.speaker, "Unknown")
        lines.append(f"{segment.start:.3f}\t{segment.end:.3f}\t{speaker}\t{value}")

    return "\r\n".join(lines) + "\r\n"
