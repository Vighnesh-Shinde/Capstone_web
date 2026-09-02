package com.project.depression.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record UpdateProfileRequest(
        @NotBlank @Size(max = 255) String name,

        // Nullable: counselors may have no username and keep signing in by email.
        // Constrained to identifier-safe characters so it can't be confused with
        // an email address at login-resolution time.
        @Size(min = 3, max = 50)
        @Pattern(regexp = "^[A-Za-z0-9._-]+$",
                message = "Username may only contain letters, numbers, dots, underscores and hyphens")
        String username,

        // --- contact -------------------------------------------------------
        @Size(min = 2, max = 2) String countryCode,
        @Size(max = 6) String phoneDialCode,
        @Size(max = 20) String phoneNational,
        @Size(max = 255) String addressLine1,
        @Size(max = 255) String addressLine2,
        @Size(max = 120) String city,
        @Size(max = 120) String stateRegion,
        @Size(max = 20) String postalCode,
        @Size(max = 64) String timezone,

        // --- personal ------------------------------------------------------
        @Size(max = 50) String gender,
        @Past(message = "Date of birth must be in the past") LocalDate dateOfBirth,

        // --- professional --------------------------------------------------
        List<String> practiceLanguages,
        @Size(max = 255) String organization,
        @Size(max = 255) String professionalRole,
        @Size(max = 255) String qualification,
        @Size(max = 255) String registrationNumber,
        @Size(max = 200) String licenceAuthority,
        LocalDate licenceExpiresOn,
        @Min(0) @Max(80) Integer yearsOfExperience,
        @Size(max = 300) String professionalWebsite
) {

    /**
     * Practice languages arrive as a list and are stored comma-separated.
     * Commas are stripped from each entry rather than escaped: a language code
     * never contains one, so a comma can only be corrupt input, and letting it
     * through would split one language into two on the next read.
     */
    public String practiceLanguagesCsv() {
        if (practiceLanguages == null || practiceLanguages.isEmpty()) {
            return null;
        }
        String csv = practiceLanguages.stream()
                .filter(java.util.Objects::nonNull)
                .map(s -> s.trim().replace(",", ""))
                .filter(s -> !s.isEmpty())
                .distinct()
                .collect(java.util.stream.Collectors.joining(","));
        return csv.isEmpty() ? null : csv;
    }
}
