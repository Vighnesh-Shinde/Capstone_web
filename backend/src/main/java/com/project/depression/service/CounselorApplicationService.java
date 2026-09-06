package com.project.depression.service;

import com.project.depression.dto.*;
import com.project.depression.entity.*;
import com.project.depression.repository.CounselorApplicationRepository;
import com.project.depression.repository.UserRepository;
import com.project.depression.repository.VerificationDocumentRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class CounselorApplicationService {

    private final CounselorApplicationRepository applicationRepository;
    private final VerificationDocumentRepository documentRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final FileStorageService fileStorageService;
    private final EmailVerificationService emailVerificationService;
    private final AuditLogService auditLogService;
    private final CountryCatalogService countryCatalog;

    public CounselorApplicationService(
            CounselorApplicationRepository applicationRepository,
            VerificationDocumentRepository documentRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            FileStorageService fileStorageService,
            AuditLogService auditLogService,
            CountryCatalogService countryCatalog,
            EmailVerificationService emailVerificationService
    ) {
        this.applicationRepository = applicationRepository;
        this.documentRepository = documentRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.fileStorageService = fileStorageService;
        this.auditLogService = auditLogService;
        this.countryCatalog = countryCatalog;
        this.emailVerificationService = emailVerificationService;
    }

    @Transactional
    public ApplicationSubmitResponse submit(CounselorApplicationForm form, List<DocumentMetadata> documents) {
        String email = form.email().trim().toLowerCase();

        if (userRepository.existsByEmail(email) || applicationRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account or application already exists for this email");
        }

        String country = countryCatalog.requireValidCountry(form.countryCode());

        CounselorApplication application = CounselorApplication.builder()
                .fullName(form.fullName().trim())
                .email(email)
                .passwordHash(passwordEncoder.encode(form.password()))
                .experience(form.experience())
                .additionalInfo(form.additionalInfo())
                .profile(ProfessionalProfile.builder()
                        .countryCode(country)
                        .phoneDialCode(form.phoneDialCode())
                        .phoneNational(form.phoneNational())
                        // Validated and canonicalised here so a bad number is
                        // rejected at submission, while the applicant is still
                        // looking at the form, rather than discovered by an
                        // admin trying to ring them weeks later.
                        .phoneE164(countryCatalog.toE164(form.phoneDialCode(), form.phoneNational()))
                        .addressLine1(form.addressLine1())
                        .addressLine2(form.addressLine2())
                        .city(form.city())
                        .stateRegion(form.stateRegion())
                        .postalCode(form.postalCode())
                        .gender(form.gender())
                        .dateOfBirth(form.dateOfBirth())
                        .timezone(form.timezone())
                        .practiceLanguages(form.practiceLanguages())
                        .organization(form.organization())
                        .professionalRole(form.professionalRole())
                        .qualification(form.qualification())
                        .registrationNumber(form.registrationNumber())
                        .licenceAuthority(form.licenceAuthority())
                        .licenceExpiresOn(form.licenceExpiresOn())
                        .yearsOfExperience(form.yearsOfExperience())
                        .professionalWebsite(form.professionalWebsite())
                        .build())
                .status(ApplicationStatus.PENDING)
                .build();
        application = applicationRepository.save(application);

        // After the row is saved, so a failure to send cannot roll back a
        // successfully received application.
        emailVerificationService.sendForApplication(application);

        for (DocumentMetadata meta : documents) {
            MultipartFile file = meta.file();
            if (file == null || file.isEmpty()) continue;

            String path = fileStorageService.storeApplicationDocument(application.getId(), file);
            documentRepository.save(VerificationDocument.builder()
                    .application(application)
                    .fileName(file.getOriginalFilename())
                    .filePath(path)
                    .contentType(file.getContentType())
                    .fileSize(file.getSize())
                    .docType(DocumentType.parse(meta.docType()))
                    .issuingAuthority(meta.issuingAuthority())
                    .documentNumber(meta.documentNumber())
                    .expiresOn(meta.expiresOn())
                    .build());
        }

        auditLogService.log(null, "COUNSELOR_APPLICATION_SUBMITTED", "COUNSELOR_APPLICATION", application.getId(), email);

        return new ApplicationSubmitResponse(application.getId(), application.getStatus().name(), application.getSubmittedAt());
    }

    @Transactional(readOnly = true)
    public PageResponse<CounselorApplicationResponse> list(ApplicationStatus status, Pageable pageable) {
        Page<CounselorApplication> page = status == null
                ? applicationRepository.findAllByOrderBySubmittedAtDesc(pageable)
                : applicationRepository.findByStatusOrderBySubmittedAtDesc(status, pageable);
        return PageResponse.from(page.map(this::toResponse));
    }

    @Transactional(readOnly = true)
    public CounselorApplicationResponse getById(UUID id) {
        return toResponse(findApplication(id));
    }

    @Transactional
    public CounselorApplicationResponse approve(UUID id, User admin) {
        CounselorApplication application = findApplication(id);
        if (application.getStatus() != ApplicationStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a PENDING application can be approved");
        }

        User counselor = User.builder()
                .name(application.getFullName())
                .email(application.getEmail())
                .passwordHash(application.getPasswordHash())
                .role(Role.COUNSELOR)
                .applicationId(application.getId())
                // Carried over rather than reset: the applicant already proved
                // they control this address, and making them do it again after
                // approval would be busywork.
                .emailVerified(application.isEmailVerified())
                .emailVerifiedAt(application.getEmailVerifiedAt())
                // Copied, not shared — see ProfessionalProfile.copy().
                .profile(application.profileOrEmpty().copy())
                .verifiedAt(java.time.Instant.now())
                // Verification cannot outlive the licence it was based on. When
                // no expiry was supplied there is nothing to derive, so the
                // account simply carries no review date rather than a made-up
                // one; an administrator can set it on the counselor screen.
                .verifiedUntil(application.profileOrEmpty().getLicenceExpiresOn())
                .verifiedBy(admin.getId())
                .build();
        counselor = userRepository.save(counselor);

        application.setStatus(ApplicationStatus.APPROVED);
        application.setReviewedAt(java.time.Instant.now());
        application.setReviewedBy(admin);
        application.setCreatedUserId(counselor.getId());
        application = applicationRepository.save(application);

        auditLogService.log(admin, "COUNSELOR_APPROVED", "COUNSELOR_APPLICATION", application.getId(), application.getEmail());

        return toResponse(application);
    }

    @Transactional
    public CounselorApplicationResponse reject(UUID id, String reason, User admin) {
        CounselorApplication application = findApplication(id);
        if (application.getStatus() != ApplicationStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a PENDING application can be rejected");
        }

        application.setStatus(ApplicationStatus.REJECTED);
        application.setRejectionReason(reason);
        application.setReviewedAt(java.time.Instant.now());
        application.setReviewedBy(admin);
        application = applicationRepository.save(application);

        auditLogService.log(admin, "COUNSELOR_REJECTED", "COUNSELOR_APPLICATION", application.getId(), reason);

        return toResponse(application);
    }

    @Transactional
    public CounselorApplicationResponse suspend(UUID id, User admin) {
        CounselorApplication application = findApplication(id);
        if (application.getStatus() != ApplicationStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an APPROVED counselor can be suspended");
        }

        application.setStatus(ApplicationStatus.SUSPENDED);
        application.setReviewedAt(java.time.Instant.now());
        application.setReviewedBy(admin);
        application = applicationRepository.save(application);

        auditLogService.log(admin, "COUNSELOR_SUSPENDED", "COUNSELOR_APPLICATION", application.getId(), application.getEmail());

        return toResponse(application);
    }

    @Transactional
    public CounselorApplicationResponse reactivate(UUID id, User admin) {
        CounselorApplication application = findApplication(id);
        if (application.getStatus() != ApplicationStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a SUSPENDED counselor can be reactivated");
        }

        application.setStatus(ApplicationStatus.APPROVED);
        application.setReviewedAt(java.time.Instant.now());
        application.setReviewedBy(admin);
        application = applicationRepository.save(application);

        auditLogService.log(admin, "COUNSELOR_REACTIVATED", "COUNSELOR_APPLICATION", application.getId(), application.getEmail());

        return toResponse(application);
    }

    private CounselorApplication findApplication(UUID id) {
        return applicationRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Counselor application not found: " + id));
    }

    private CounselorApplicationResponse toResponse(CounselorApplication a) {
        List<VerificationDocumentResponse> docs = a.getDocuments().stream()
                .map(d -> new VerificationDocumentResponse(
                        d.getId(), d.getFileName(), d.getContentType(),
                        d.getDocType().name(), d.getDocType().label(),
                        d.getIssuingAuthority(), d.getDocumentNumber(),
                        d.getIssuedOn(), d.getExpiresOn(), d.isExpired(),
                        d.getFileSize(), d.getUploadedAt()))
                .toList();

        return new CounselorApplicationResponse(
                a.getId(), a.getFullName(), a.getEmail(),
                // The pre-split free-text phone, still shown for applications
                // submitted before the number was captured structurally.
                a.getPhone(),
                a.getExperience(), a.getAdditionalInfo(),
                ProfessionalProfileDto.from(a.getProfile()),
                a.getStatus().name(), a.getRejectionReason(), a.getSubmittedAt(),
                a.getReviewedAt(), a.getReviewedBy() == null ? null : a.getReviewedBy().getName(), docs
        );
    }
}
