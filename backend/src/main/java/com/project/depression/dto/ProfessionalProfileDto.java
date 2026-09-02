package com.project.depression.dto;

import com.project.depression.entity.ProfessionalProfile;

import java.time.LocalDate;
import java.util.List;

/**
 * A counselor's professional and contact details, over the wire.
 *
 * One record serves the application form, the counselor's own profile screen,
 * and the admin review screen. They genuinely show the same fields, and three
 * near-identical DTOs would drift the first time one field was added.
 *
 * {@code practiceLanguages} is a list here but a comma-separated string in the
 * database — the wire format should be the shape the client actually wants,
 * and the storage format should be the shape the database can index. Splitting
 * them costs one mapping function and saves a join table.
 */
public record ProfessionalProfileDto(
        String countryCode,
        String phoneDialCode,
        String phoneNational,
        String phoneE164,
        String addressLine1,
        String addressLine2,
        String city,
        String stateRegion,
        String postalCode,
        String gender,
        LocalDate dateOfBirth,
        String timezone,
        List<String> practiceLanguages,
        String organization,
        String professionalRole,
        String qualification,
        String registrationNumber,
        String licenceAuthority,
        LocalDate licenceExpiresOn,
        Integer yearsOfExperience,
        String professionalWebsite,
        /**
         * Computed, never stored. An expiry date on screen still needs a human
         * to compare it with today; a boolean the server has already worked out
         * is what actually gets noticed in a list of forty counselors.
         */
        boolean licenceExpired
) {

    public static ProfessionalProfileDto from(ProfessionalProfile p) {
        if (p == null) {
            p = new ProfessionalProfile();
        }
        return new ProfessionalProfileDto(
                p.getCountryCode(), p.getPhoneDialCode(), p.getPhoneNational(), p.getPhoneE164(),
                p.getAddressLine1(), p.getAddressLine2(), p.getCity(), p.getStateRegion(),
                p.getPostalCode(), p.getGender(), p.getDateOfBirth(), p.getTimezone(),
                splitLanguages(p.getPracticeLanguages()),
                p.getOrganization(), p.getProfessionalRole(), p.getQualification(),
                p.getRegistrationNumber(), p.getLicenceAuthority(), p.getLicenceExpiresOn(),
                p.getYearsOfExperience(), p.getProfessionalWebsite(),
                p.isLicenceExpired()
        );
    }

    public static List<String> splitLanguages(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
