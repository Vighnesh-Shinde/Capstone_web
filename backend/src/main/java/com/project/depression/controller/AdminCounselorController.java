package com.project.depression.controller;

import com.project.depression.dto.CounselorApplicationResponse;
import com.project.depression.dto.PageResponse;
import com.project.depression.dto.RejectApplicationRequest;
import com.project.depression.entity.ApplicationStatus;
import com.project.depression.entity.User;
import com.project.depression.entity.VerificationDocument;
import com.project.depression.repository.UserRepository;
import com.project.depression.repository.VerificationDocumentRepository;
import com.project.depression.service.CounselorApplicationService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/counselor-applications")
public class AdminCounselorController {

    private final CounselorApplicationService applicationService;
    private final VerificationDocumentRepository documentRepository;
    private final UserRepository userRepository;

    public AdminCounselorController(
            CounselorApplicationService applicationService,
            VerificationDocumentRepository documentRepository,
            UserRepository userRepository
    ) {
        this.applicationService = applicationService;
        this.documentRepository = documentRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<PageResponse<CounselorApplicationResponse>> list(
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "submittedAt"));
        return ResponseEntity.ok(applicationService.list(status, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CounselorApplicationResponse> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(applicationService.getById(id));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<CounselorApplicationResponse> approve(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(applicationService.approve(id, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<CounselorApplicationResponse> reject(
            @PathVariable UUID id, @RequestBody(required = false) RejectApplicationRequest request, Authentication authentication
    ) {
        String reason = request == null ? null : request.reason();
        return ResponseEntity.ok(applicationService.reject(id, reason, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<CounselorApplicationResponse> suspend(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(applicationService.suspend(id, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/reactivate")
    public ResponseEntity<CounselorApplicationResponse> reactivate(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(applicationService.reactivate(id, currentAdmin(authentication)));
    }

    @GetMapping("/{applicationId}/documents/{documentId}")
    public ResponseEntity<Resource> downloadDocument(@PathVariable UUID applicationId, @PathVariable UUID documentId) {
        VerificationDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new NoSuchElementException("Document not found: " + documentId));

        if (!document.getApplication().getId().equals(applicationId)) {
            throw new NoSuchElementException("Document not found for this application");
        }

        Resource resource = new FileSystemResource(Path.of(document.getFilePath()));
        MediaType mediaType = document.getContentType() != null
                ? MediaType.parseMediaType(document.getContentType())
                : MediaType.APPLICATION_OCTET_STREAM;

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header("Content-Disposition", "attachment; filename=\"" + document.getFileName() + "\"")
                .body(resource);
    }

    private User currentAdmin(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Admin user not found"));
    }
}
