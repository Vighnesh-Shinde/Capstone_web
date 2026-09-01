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
    private final AuditLogService auditLogService;

    public CounselorApplicationService(
            CounselorApplicationRepository applicationRepository,
            VerificationDocumentRepository documentRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            FileStorageService fileStorageService,
            AuditLogService auditLogService
    ) {
        this.applicationRepository = applicationRepository;
        this.documentRepository = documentRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.fileStorageService = fileStorageService;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public ApplicationSubmitResponse submit(
            String fullName, String email, String rawPassword, String phone, String organization,
            String professionalRole, String qualification, String experience,
            String registrationNumber, String additionalInfo, List<MultipartFile> documents
    ) {
        if (userRepository.existsByEmail(email) || applicationRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account or application already exists for this email");
        }

        CounselorApplication application = CounselorApplication.builder()
                .fullName(fullName)
                .email(email)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .phone(phone)
                .organization(organization)
                .professionalRole(professionalRole)
                .qualification(qualification)
                .experience(experience)
                .registrationNumber(registrationNumber)
                .additionalInfo(additionalInfo)
                .status(ApplicationStatus.PENDING)
                .build();
        application = applicationRepository.save(application);

        if (documents != null) {
            for (MultipartFile doc : documents) {
                if (doc == null || doc.isEmpty()) continue;
                String path = fileStorageService.storeApplicationDocument(application.getId(), doc);
                VerificationDocument document = VerificationDocument.builder()
                        .application(application)
                        .fileName(doc.getOriginalFilename())
                        .filePath(path)
                        .contentType(doc.getContentType())
                        .build();
                documentRepository.save(document);
            }
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
                .map(d -> new VerificationDocumentResponse(d.getId(), d.getFileName(), d.getContentType(), d.getUploadedAt()))
                .toList();

        return new CounselorApplicationResponse(
                a.getId(), a.getFullName(), a.getEmail(), a.getPhone(), a.getOrganization(),
                a.getProfessionalRole(), a.getQualification(), a.getExperience(), a.getRegistrationNumber(),
                a.getAdditionalInfo(), a.getStatus().name(), a.getRejectionReason(), a.getSubmittedAt(),
                a.getReviewedAt(), a.getReviewedBy() == null ? null : a.getReviewedBy().getName(), docs
        );
    }
}
