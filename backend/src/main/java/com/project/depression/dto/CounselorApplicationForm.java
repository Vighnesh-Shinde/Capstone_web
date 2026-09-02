package com.project.depression.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

/**
 * Everything a counselor submits when requesting access.
 *
 * Bound with {@code @ModelAttribute} from the multipart form rather than
 * twenty-odd {@code @RequestParam} arguments — the controller signature had
 * already reached ten parameters before this, and the failure mode of a long
 * positional argument list is two adjacent strings quietly swapping places.
 *
 * Only four fields are required: name, email, password, and country. Country
 * earns its place because everything else is read through it — which regulator
 * is plausible, how to parse the phone number, which privacy regime applies,
 * which crisis numbers to show. The rest is left optional because an
 * administrator judging an application is better served by an honest gap than
 * by a required field somebody filled in with "N/A".
 */
public record CounselorApplicationForm(

        @NotBlank @Size(max = 255) String fullName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 8, max = 100, message = "must be at least 8 characters") String password,

        @NotBlank(message = "Select the country you practise in") @Size(min = 2, max = 2) String countryCode,

        // --- contact -------------------------------------------------------
        @Size(max = 6) String phoneDialCode,
        @Size(max = 20) String phoneNational,
        @Size(max = 255) String addressLine1,
        @Size(max = 255) String addressLine2,
        @Size(max = 120) String city,
        @Size(max = 120) String stateRegion,
        @Size(max = 20) String postalCode,
        @Size(max = 64) String timezone,

        // --- personal (all optional, and none of it gates approval) ---------
        @Size(max = 50) String gender,
        @Past(message = "Date of birth must be in the past")
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateOfBirth,

        // --- professional --------------------------------------------------
        @Size(max = 255) String organization,
        @Size(max = 255) String professionalRole,
        @Size(max = 255) String qualification,
        @Size(max = 255) String registrationNumber,
        @Size(max = 200) String licenceAuthority,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate licenceExpiresOn,
        @Min(0) @Max(80) Integer yearsOfExperience,
        @Size(max = 300) String professionalWebsite,

        /** Comma-separated BCP-47 codes, matching the storage format. */
        @Size(max = 200) String practiceLanguages,

        @Size(max = 500) String experience,
        @Size(max = 2000) String additionalInfo
) {
}
