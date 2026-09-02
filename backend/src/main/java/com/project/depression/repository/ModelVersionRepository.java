package com.project.depression.repository;

import com.project.depression.entity.ModelModality;
import com.project.depression.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, UUID> {

    List<ModelVersion> findAllByOrderByUploadedAtDesc();

    List<ModelVersion> findByLanguageOrderByUploadedAtDesc(String language);

    List<ModelVersion> findByModalityOrderByUploadedAtDesc(ModelModality modality);

    List<ModelVersion> findByLanguageAndModalityOrderByUploadedAtDesc(String language, ModelModality modality);

    /**
     * The serving model for one modality in one language. Language is part of
     * the key because activating a Marathi text model must not deactivate the
     * English one — they serve different sessions.
     */
    Optional<ModelVersion> findByModalityAndLanguageAndActiveIsTrue(ModelModality modality, String language);

    List<ModelVersion> findByActiveIsTrue();

    boolean existsByModalityAndLanguageAndVersionLabel(
            ModelModality modality, String language, String versionLabel);
}
