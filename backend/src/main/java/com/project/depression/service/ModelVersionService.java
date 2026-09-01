package com.project.depression.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.depression.client.MlServiceClient;
import com.project.depression.dto.MlValidateModelResponse;
import com.project.depression.dto.ModelVersionResponse;
import com.project.depression.entity.ModelModality;
import com.project.depression.entity.ModelVersion;
import com.project.depression.entity.User;
import com.project.depression.repository.ModelVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Upload, validate, activate and roll back trained model weights.
 *
 * The point of this is to make retraining deployable by the operator rather
 * than by a developer: train elsewhere on GPU, upload the .joblib here, and
 * activate it. No code change, no redeploy.
 *
 * The validation step is the important one. A model with the wrong input width
 * still loads and still returns a probability — it just returns a meaningless
 * one, silently. So the ML service is asked to inspect every upload before it
 * can be activated, and a mismatch is a hard rejection.
 *
 *     SECURITY: a .joblib is a Python pickle, and loading one executes arbitrary
 *     code inside the ML service. Uploading a model is therefore equivalent to
 *     running code on that host. This is restricted to authenticated ADMIN users
 *     for exactly that reason, and admins must be treated as fully trusted.
 *     Never widen this endpoint's access.
 */
@Service
public class ModelVersionService {

    private static final Logger log = LoggerFactory.getLogger(ModelVersionService.class);

    private static final String MODEL_EXTENSION = ".joblib";
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(java.time.ZoneOffset.UTC);

    private final ModelVersionRepository modelVersionRepository;
    private final MlServiceClient mlServiceClient;
    private final AuditLogService auditLogService;
    private final ObjectMapper objectMapper;

    @Value("${app.models.dir}")
    private String modelsDir;

    @Value("${app.models.max-bytes:524288000}")
    private long maxBytes;

    public ModelVersionService(
            ModelVersionRepository modelVersionRepository,
            MlServiceClient mlServiceClient,
            AuditLogService auditLogService,
            ObjectMapper objectMapper
    ) {
        this.modelVersionRepository = modelVersionRepository;
        this.mlServiceClient = mlServiceClient;
        this.auditLogService = auditLogService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<ModelVersionResponse> list(ModelModality modality) {
        List<ModelVersion> versions = modality == null
                ? modelVersionRepository.findAllByOrderByUploadedAtDesc()
                : modelVersionRepository.findByModalityOrderByUploadedAtDesc(modality);
        return versions.stream().map(this::toResponse).toList();
    }

    /**
     * Store the upload, then have the ML service validate it. A file that fails
     * validation is deleted and never recorded — a rejected model should leave
     * nothing behind to accidentally activate later.
     */
    @Transactional
    public ModelVersionResponse upload(
            ModelModality modality, String versionLabel, String notes, MultipartFile file, User admin
    ) {
        validateUploadShape(file);

        String label = (versionLabel == null || versionLabel.isBlank())
                ? modality.manifestKey() + "-" + STAMP.format(Instant.now())
                : versionLabel.trim();

        if (modelVersionRepository.existsByModalityAndVersionLabel(modality, label)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A " + modality + " version labelled '" + label + "' already exists.");
        }

        // Filename is derived, never taken from the client — the original name
        // could contain path separators or traversal sequences.
        String storedName = modality.manifestKey() + "__" + label.replaceAll("[^A-Za-z0-9._-]", "-")
                + MODEL_EXTENSION;
        Path destination = modelsDirPath().resolve(storedName);

        String sha256;
        try {
            Files.createDirectories(modelsDirPath());
            sha256 = copyAndHash(file, destination);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not store the uploaded model file.", e);
        }

        MlValidateModelResponse validation;
        try {
            validation = mlServiceClient.validateModel(
                    destination.toAbsolutePath().toString(), modality.manifestKey());
        } catch (Exception e) {
            deleteQuietly(destination);
            log.error("Model validation call failed for {}", storedName, e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Could not reach the ML service to validate this model. It has not been saved.");
        }

        if (validation == null || !validation.ok()) {
            deleteQuietly(destination);
            String reason = validation == null ? "No response from the ML service." : validation.error();
            auditLogService.log(admin, "MODEL_UPLOAD_REJECTED", "MODEL_VERSION", null,
                    modality + " / " + label + ": " + reason);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "This model was rejected: " + reason);
        }

        ModelVersion version = modelVersionRepository.save(ModelVersion.builder()
                .modality(modality)
                .versionLabel(label)
                .fileName(storedName)
                .filePath(destination.toString())
                .sha256(sha256)
                .featureCount(validation.featureCount())
                .threshold(validation.threshold())
                .modelSummary(validation.modelRepr())
                .notes(notes == null || notes.isBlank() ? null : notes.trim())
                .uploadedBy(admin)
                .build());

        auditLogService.log(admin, "MODEL_UPLOADED", "MODEL_VERSION", version.getId(),
                modality + " / " + label + " (sha256 " + sha256.substring(0, 12) + "…)");
        log.info("Accepted {} model '{}' ({} features)", modality, label, validation.featureCount());

        return toResponse(version);
    }

    /**
     * Make a version the one that serves. Rolling back is the same operation
     * applied to an older row — there is no separate rollback path to get wrong.
     */
    @Transactional
    public ModelVersionResponse activate(UUID versionId, User admin) {
        ModelVersion target = modelVersionRepository.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Model version not found: " + versionId));

        if (!Files.exists(Path.of(target.getFilePath()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The file for this version is missing from disk: " + target.getFileName());
        }

        ModelVersion previous = modelVersionRepository
                .findByModalityAndActiveIsTrue(target.getModality()).orElse(null);
        if (previous != null && previous.getId().equals(target.getId())) {
            return toResponse(target);
        }

        // Deactivate first and flush: the partial unique index allows only one
        // active row per modality, so both cannot be active even momentarily.
        if (previous != null) {
            previous.setActive(false);
            modelVersionRepository.saveAndFlush(previous);
        }
        target.setActive(true);
        target.setActivatedAt(Instant.now());
        modelVersionRepository.saveAndFlush(target);

        writeManifest();

        try {
            mlServiceClient.reloadModels();
        } catch (Exception e) {
            // The database and manifest now agree, but the running service is
            // still serving the old weights. Surfaced as an error rather than
            // silently succeeding, because "activated" would otherwise be a lie.
            log.error("Manifest updated but ML service reload failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Activated in the database, but the ML service did not reload and is still "
                            + "serving the previous weights. Restart it, or activate again once it is reachable.");
        }

        auditLogService.log(admin, "MODEL_ACTIVATED", "MODEL_VERSION", versionId,
                target.getModality() + " / " + target.getVersionLabel()
                        + (previous == null ? "" : " (replacing " + previous.getVersionLabel() + ")"));
        log.info("Activated {} model '{}'", target.getModality(), target.getVersionLabel());

        return toResponse(target);
    }

    /**
     * Revert a modality to the model that shipped with the project.
     *
     * Without this, activating a single bad upload would be a one-way door:
     * "activate an older version" only helps if an older version exists. The
     * built-in weights are the known-good baseline, so there must always be a
     * way back to them.
     */
    @Transactional
    public void revertToDefault(ModelModality modality, User admin) {
        ModelVersion active = modelVersionRepository.findByModalityAndActiveIsTrue(modality)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        modality + " is already using the built-in model."));

        active.setActive(false);
        modelVersionRepository.saveAndFlush(active);

        writeManifest();

        try {
            mlServiceClient.reloadModels();
        } catch (Exception e) {
            log.error("Manifest updated but ML service reload failed during revert", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Reverted in the database, but the ML service did not reload and is still "
                            + "serving the previous weights. Restart it, or try again.");
        }

        auditLogService.log(admin, "MODEL_REVERTED_TO_DEFAULT", "MODEL_VERSION", active.getId(),
                modality + " reverted from " + active.getVersionLabel() + " to the built-in model");
        log.info("Reverted {} to the built-in model (was '{}')", modality, active.getVersionLabel());
    }

    /**
     * Rewrite the manifest the ML service reads. Only modalities with an active
     * row are written, so an unset modality falls back to the shipped default
     * rather than to a missing file.
     */
    private void writeManifest() {
        Map<String, String> manifest = new LinkedHashMap<>();
        for (ModelVersion active : modelVersionRepository.findByActiveIsTrue()) {
            manifest.put(active.getModality().manifestKey(), active.getFileName());
        }

        Path manifestPath = modelsDirPath().resolve("active_manifest.json");
        try {
            Files.createDirectories(modelsDirPath());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(manifestPath.toFile(), manifest);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not write the model manifest at " + manifestPath, e);
        }
    }

    private void validateUploadShape(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidFileException("No model file was provided");
        }
        if (file.getSize() > maxBytes) {
            throw new InvalidFileException(
                    "Model file is too large (max " + (maxBytes / (1024 * 1024)) + "MB)");
        }
        String original = file.getOriginalFilename();
        String extension = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf('.')).toLowerCase(Locale.ROOT)
                : "";
        if (!MODEL_EXTENSION.equals(extension)) {
            throw new InvalidFileException("Model files must be " + MODEL_EXTENSION + " bundles.");
        }
    }

    /** Streams to disk and hashes in one pass — the file may be hundreds of MB. */
    private String copyAndHash(MultipartFile file, Path destination) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }

        try (InputStream in = file.getInputStream();
             DigestInputStream digesting = new DigestInputStream(in, digest)) {
            Files.copy(digesting, destination, StandardCopyOption.REPLACE_EXISTING);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("Could not remove rejected model file {}", path, e);
        }
    }

    private Path modelsDirPath() {
        return Path.of(modelsDir);
    }

    private ModelVersionResponse toResponse(ModelVersion v) {
        return new ModelVersionResponse(
                v.getId(), v.getModality().name(), v.getVersionLabel(), v.getFileName(),
                v.getSha256(), v.getFeatureCount(), v.getThreshold(), v.getModelSummary(),
                v.getNotes(), v.isActive(),
                v.getUploadedBy() == null ? null : v.getUploadedBy().getName(),
                v.getUploadedAt(), v.getActivatedAt()
        );
    }
}
