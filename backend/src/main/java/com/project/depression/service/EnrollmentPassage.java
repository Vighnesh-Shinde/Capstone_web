package com.project.depression.service;

/**
 * The passage read aloud during voice enrollment.
 *
 * WHY THIS TEXT
 * -------------
 * It is original, so no licence question attaches to a file every counselor on
 * the platform will read. It is phonetically varied — plosives, fricatives,
 * nasals, and a wide vowel spread — because a voiceprint built from a narrow
 * set of sounds matches poorly against ordinary conversation. It runs about
 * forty-five seconds at a normal reading pace, comfortably over the twelve
 * seconds of speech the extractor requires, so somebody who trails off near the
 * end still enrols successfully.
 *
 * And it is deliberately about nothing. The person reading it is a clinician
 * being voice-printed by their employer's software, not a participant: asking
 * them to read something emotionally loaded would be an odd thing to do, and
 * the recording is used for identification only and never scored.
 *
 * Changing this text does not invalidate existing voiceprints — a voice is a
 * voice — but it does mean two enrolments of the same person were made from
 * different material, which is why the version is stored on every row.
 */
public final class EnrollmentPassage {

    public static final String VERSION = "v1";

    public static final String TEXT = """
            The morning train leaves the station at seven, and the platform is \
            already busy. A woman sells fresh oranges from a wooden cart while \
            three children argue about which bench to sit on. Somewhere behind \
            the ticket window a radio plays an old song that everyone seems to \
            know. The guard blows his whistle twice, checks his watch, and waves \
            the driver forward. Outside the city the fields open up, green and \
            flat, cut through by a narrow canal. A white bird lifts off the \
            water, circles once, and settles again near the far bank. By eleven \
            the light is sharp enough to read by, and the journey feels much \
            shorter than the timetable promised.""";

    /** Roughly how long the passage takes to read, for the on-screen guidance. */
    public static final int APPROX_SECONDS = 45;

    private EnrollmentPassage() {
    }
}
