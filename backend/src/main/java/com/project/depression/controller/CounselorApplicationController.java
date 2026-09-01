package com.project.depression.controller;

import com.project.depression.dto.ApplicationSubmitResponse;
import com.project.depression.service.CounselorApplicationService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/counselor-applications")
@Validated
public class CounselorApplicationController {

    private final CounselorApplicationService applicationService;

    public CounselorApplicationController(CounselorApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<ApplicationSubmitResponse> submit(
            @RequestParam @NotBlank String fullName,
            @RequestParam @Email @NotBlank String email,
            @RequestParam @NotBlank @Size(min = 8, max = 100, message = "must be at least 8 characters") String password,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String organization,
            @RequestParam(required = false) String professionalRole,
            @RequestParam(required = false) String qualification,
            @RequestParam(required = false) String experience,
            @RequestParam(required = false) String registrationNumber,
            @RequestParam(required = false) String additionalInfo,
            @RequestParam(required = false) List<MultipartFile> documents
    ) {
        ApplicationSubmitResponse response = applicationService.submit(
                fullName, email, password, phone, organization, professionalRole,
                qualification, experience, registrationNumber, additionalInfo, documents
        );
        return ResponseEntity.status(201).body(response);
    }
}
