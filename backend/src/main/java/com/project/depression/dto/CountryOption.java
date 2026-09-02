package com.project.depression.dto;

/**
 * One country, for the country and dial-code pickers.
 *
 * {@code dialCode} is nullable: a few ISO territories (Antarctica, Bouvet
 * Island) have no international dialling code at all, and inventing one so the
 * field is never null would be worse than an empty picker entry.
 */
public record CountryOption(
        String code,
        String name,
        String dialCode,
        String flag
) {
}
