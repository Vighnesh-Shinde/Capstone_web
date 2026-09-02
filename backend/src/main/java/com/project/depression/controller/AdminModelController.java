package com.project.depression.controller;

import com.project.depression.dto.ModelVersionResponse;
import com.project.depression.entity.ModelModality;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.ModelVersionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Model-weight administration.
 *
 * Under /api/admin/**, so SecurityConfig already restricts every method here to
 * ADMIN. That matters more than usual: uploading a model means executing code
 * on the ML service host — see ModelVersionService's class docs.
 */
@RestController
@RequestMapping("/api/admin/models")
public class AdminModelController {

    private final ModelVersionService modelVersionService;
    private final UserRepository userRepository;

    public AdminModelController(ModelVersionService modelVersionService, UserRepository userRepository) {
        this.modelVersionService = modelVersionService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<ModelVersionResponse>> list(
            @RequestParam(required = false) ModelModality modality,
            @RequestParam(required = false) String language
    ) {
        return ResponseEntity.ok(modelVersionService.list(modality, language));
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<ModelVersionResponse> upload(
            Authentication authentication,
            @RequestParam("modality") ModelModality modality,
            // Defaulted rather than required: an admin replacing the English
            // models — still the common case — should not have to say so.
            @RequestParam(value = "language", defaultValue = "en") String language,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "versionLabel", required = false) String versionLabel,
            @RequestParam(value = "notes", required = false) String notes
    ) {
        ModelVersionResponse response = modelVersionService.upload(
                modality, language, versionLabel, notes, file, currentAdmin(authentication));
        return ResponseEntity.status(201).body(response);
    }

    /** Also the rollback path — activating an older version is the same operation. */
    @PostMapping("/{id}/activate")
    public ResponseEntity<ModelVersionResponse> activate(
            @PathVariable UUID id, Authentication authentication
    ) {
        return ResponseEntity.ok(modelVersionService.activate(id, currentAdmin(authentication)));
    }

    /** Escape hatch back to the weights that shipped with the project. */
    @PostMapping("/revert-to-default")
    public ResponseEntity<Void> revertToDefault(
            @RequestParam("modality") ModelModality modality,
            @RequestParam(value = "language", defaultValue = "en") String language,
            Authentication authentication
    ) {
        modelVersionService.revertToDefault(modality, language, currentAdmin(authentication));
        return ResponseEntity.noContent().build();
    }

    private User currentAdmin(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Admin user not found"));
    }
}
