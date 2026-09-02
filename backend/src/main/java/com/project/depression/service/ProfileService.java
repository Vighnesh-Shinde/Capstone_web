package com.project.depression.service;

import com.project.depression.dto.ChangePasswordRequest;
import com.project.depression.dto.ProfessionalProfileDto;
import com.project.depression.dto.ProfileResponse;
import com.project.depression.dto.UpdateProfileRequest;
import com.project.depression.entity.ProfessionalProfile;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@Service
public class ProfileService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    private final CountryCatalogService countryCatalog;

    public ProfileService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuditLogService auditLogService,
            CountryCatalogService countryCatalog
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
        this.countryCatalog = countryCatalog;
    }

    public ProfileResponse toResponse(User user) {
        return new ProfileResponse(
                user.getId(), user.getName(), user.getEmail(), user.getUsername(),
                user.getRole().name(), user.getStatus().name(),
                ProfessionalProfileDto.from(user.getProfile()),
                user.getVerifiedAt(), user.getVerifiedUntil(), user.isVerificationExpired(),
                user.getCreatedAt(), user.getLastLoginAt(), user.getPasswordChangedAt()
        );
    }

    @Transactional
    public ProfileResponse updateProfile(User user, UpdateProfileRequest request) {
        String username = normalizeUsername(request.username());

        if (username != null
                && !username.equalsIgnoreCase(user.getUsername())
                && userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is already taken.");
        }

        user.setName(request.name().trim());
        user.setUsername(username);

        ProfessionalProfile profile = user.profileOrEmpty();
        profile.setCountryCode(countryCatalog.requireValidCountry(request.countryCode()));
        profile.setPhoneDialCode(trimToNull(request.phoneDialCode()));
        profile.setPhoneNational(trimToNull(request.phoneNational()));
        profile.setPhoneE164(countryCatalog.toE164(request.phoneDialCode(), request.phoneNational()));
        profile.setAddressLine1(trimToNull(request.addressLine1()));
        profile.setAddressLine2(trimToNull(request.addressLine2()));
        profile.setCity(trimToNull(request.city()));
        profile.setStateRegion(trimToNull(request.stateRegion()));
        profile.setPostalCode(trimToNull(request.postalCode()));
        profile.setTimezone(requireValidTimezone(request.timezone()));
        profile.setGender(trimToNull(request.gender()));
        profile.setDateOfBirth(request.dateOfBirth());
        profile.setPracticeLanguages(request.practiceLanguagesCsv());
        profile.setOrganization(trimToNull(request.organization()));
        profile.setProfessionalRole(trimToNull(request.professionalRole()));
        profile.setQualification(trimToNull(request.qualification()));
        profile.setRegistrationNumber(trimToNull(request.registrationNumber()));
        profile.setLicenceAuthority(trimToNull(request.licenceAuthority()));
        profile.setLicenceExpiresOn(request.licenceExpiresOn());
        profile.setYearsOfExperience(request.yearsOfExperience());
        profile.setProfessionalWebsite(trimToNull(request.professionalWebsite()));
        user.setProfile(profile);

        User saved = userRepository.save(user);

        auditLogService.log(user, "PROFILE_UPDATED", "USER", user.getId(), null);
        return toResponse(saved);
    }

    /**
     * Rejects a timezone the JVM has never heard of rather than storing it.
     * An unrecognised zone id would only surface much later, as every timestamp
     * on every report silently falling back to server time.
     */
    private static String requireValidTimezone(String zoneId) {
        String trimmed = trimToNull(zoneId);
        if (trimmed == null) {
            return null;
        }
        if (!java.time.ZoneId.getAvailableZoneIds().contains(trimmed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "'" + trimmed + "' is not a recognised time zone.");
        }
        return trimmed;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional
    public void changePassword(User user, ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your current password is incorrect.");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Your new password must be different from your current one.");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        userRepository.save(user);

        auditLogService.log(user, "PASSWORD_CHANGED", "USER", user.getId(), null);
    }

    private static String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        return username.trim();
    }
}
