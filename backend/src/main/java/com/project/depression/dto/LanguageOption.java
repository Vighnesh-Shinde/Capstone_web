package com.project.depression.dto;

/**
 * One language, and what this deployment can actually do with it.
 *
 * The two booleans are the whole point of the type. {@code transcription} means
 * a transcript can be produced; {@code scoring} means trained weights for that
 * language are installed and a prediction is meaningful. They are separate
 * because today they differ for every language except English, and collapsing
 * them into one "supported" flag is exactly the mistake that would let a
 * Marathi interview be scored by an English-only model.
 */
public record LanguageOption(
        String code,
        String name,
        String nativeName,
        boolean transcription,
        boolean scoring
) {
}
