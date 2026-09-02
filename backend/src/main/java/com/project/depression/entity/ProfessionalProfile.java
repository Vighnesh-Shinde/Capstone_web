package com.project.depression.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

/**
 * The professional and contact details a counselor is identified by.
 *
 * Embedded into both {@link User} and {@link CounselorApplication} because the
 * two need exactly the same shape for different reasons: the application row is
 * a frozen record of what was submitted and approved, the user row is the live
 * profile the counselor edits afterwards. Sharing the class keeps them from
 * drifting; keeping the rows separate means updating your address in 2028 never
 * rewrites the evidence an administrator acted on in 2026.
 *
 * Every field is nullable. This is a record whose only value is being accurate,
 * and a required field that someone cannot honestly fill in just becomes a
 * field full of "N/A".
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProfessionalProfile {

    /**
     * ISO 3166-1 alpha-2. The field the rest of the platform hangs off: which
     * professional regulator is plausible, which crisis numbers to show, which
     * privacy regime applies, and how to read the phone number.
     */
    @Column(name = "country_code", length = 2)
    private String countryCode;

    /** '+91'. Stored apart from the number so it survives being reformatted. */
    @Column(name = "phone_dial_code", length = 6)
    private String phoneDialCode;

    @Column(name = "phone_national", length = 20)
    private String phoneNational;

    /** Canonical '+919876543210', derived on write from the two fields above. */
    @Column(name = "phone_e164", length = 20)
    private String phoneE164;

    @Column(name = "address_line1")
    private String addressLine1;

    @Column(name = "address_line2")
    private String addressLine2;

    @Column(length = 120)
    private String city;

    /** State, province, county, prefecture — one slot, many names. */
    @Column(name = "state_region", length = 120)
    private String stateRegion;

    @Column(name = "postal_code", length = 20)
    private String postalCode;

    /** Free text and always optional — see the V8 migration for why. */
    @Column(length = 50)
    private String gender;

    /** Stored rather than an age, which would be wrong within the year. */
    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    /** IANA zone id, so report timestamps render where the counselor is. */
    @Column(length = 64)
    private String timezone;

    /** Comma-separated BCP-47 codes: "en,hi,mr". */
    @Column(name = "practice_languages", length = 200)
    private String practiceLanguages;

    @Column private String organization;

    @Column(name = "professional_role")
    private String professionalRole;

    @Column private String qualification;

    @Column(name = "registration_number")
    private String registrationNumber;

    /** RCI, HCPC, a US state board — free text, because there is no world register. */
    @Column(name = "licence_authority", length = 200)
    private String licenceAuthority;

    @Column(name = "licence_expires_on")
    private LocalDate licenceExpiresOn;

    @Column(name = "years_of_experience")
    private Integer yearsOfExperience;

    @Column(name = "professional_website", length = 300)
    private String professionalWebsite;

    /** True once the licence's own expiry date has passed. */
    public boolean isLicenceExpired() {
        return licenceExpiresOn != null && licenceExpiresOn.isBefore(LocalDate.now());
    }

    /**
     * A detached copy, used when approving an application seeds the new user's
     * profile. A shared instance would make the two entities alias each other
     * inside one persistence context, so the counselor's first profile edit
     * would silently rewrite the application record an administrator approved.
     */
    public ProfessionalProfile copy() {
        return ProfessionalProfile.builder()
                .countryCode(countryCode)
                .phoneDialCode(phoneDialCode)
                .phoneNational(phoneNational)
                .phoneE164(phoneE164)
                .addressLine1(addressLine1)
                .addressLine2(addressLine2)
                .city(city)
                .stateRegion(stateRegion)
                .postalCode(postalCode)
                .gender(gender)
                .dateOfBirth(dateOfBirth)
                .timezone(timezone)
                .practiceLanguages(practiceLanguages)
                .organization(organization)
                .professionalRole(professionalRole)
                .qualification(qualification)
                .registrationNumber(registrationNumber)
                .licenceAuthority(licenceAuthority)
                .licenceExpiresOn(licenceExpiresOn)
                .yearsOfExperience(yearsOfExperience)
                .professionalWebsite(professionalWebsite)
                .build();
    }
}
