package com.project.depression.controller;

import com.project.depression.dto.DatasetReviewRequest;
import com.project.depression.dto.DatasetSampleDetailResponse;
import com.project.depression.dto.DatasetSampleResponse;
import com.project.depression.dto.PageResponse;
import com.project.depression.entity.DatasetEligibilityStatus;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.DatasetAdminService;
import com.project.depression.service.DatasetExportService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/dataset")
public class AdminDatasetController {

    private final DatasetAdminService datasetAdminService;
    private final DatasetExportService datasetExportService;
    private final UserRepository userRepository;

    public AdminDatasetController(
            DatasetAdminService datasetAdminService,
            DatasetExportService datasetExportService,
            UserRepository userRepository
    ) {
        this.datasetAdminService = datasetAdminService;
        this.datasetExportService = datasetExportService;
        this.userRepository = userRepository;
    }

    /**
     * Streams the approved dataset as a ZIP rather than building it in memory —
     * the feature CSV is ~3,181 columns per row and grows without bound.
     */
    @GetMapping("/export")
    public ResponseEntity<StreamingResponseBody> export(Authentication authentication) {
        User admin = currentAdmin(authentication);
        String filename = "depression-dataset-"
                + java.time.LocalDate.now(java.time.ZoneOffset.UTC) + ".zip";

        StreamingResponseBody body = out -> datasetExportService.writeExport(out, admin);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    @GetMapping
    public ResponseEntity<PageResponse<DatasetSampleResponse>> list(
            @RequestParam(required = false) DatasetEligibilityStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(datasetAdminService.list(status, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<DatasetSampleDetailResponse> getDetail(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(datasetAdminService.getDetail(id, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<DatasetSampleDetailResponse> approve(
            @PathVariable UUID id, @RequestBody(required = false) DatasetReviewRequest request, Authentication authentication
    ) {
        String notes = request == null ? null : request.notes();
        return ResponseEntity.ok(datasetAdminService.approve(id, notes, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<DatasetSampleDetailResponse> reject(
            @PathVariable UUID id, @RequestBody(required = false) DatasetReviewRequest request, Authentication authentication
    ) {
        String notes = request == null ? null : request.notes();
        return ResponseEntity.ok(datasetAdminService.reject(id, notes, currentAdmin(authentication)));
    }

    private User currentAdmin(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Admin user not found"));
    }
}
