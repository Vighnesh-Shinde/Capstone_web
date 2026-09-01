package com.project.depression.repository;

import com.project.depression.entity.ModelModality;
import com.project.depression.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, UUID> {

    List<ModelVersion> findAllByOrderByUploadedAtDesc();

    List<ModelVersion> findByModalityOrderByUploadedAtDesc(ModelModality modality);

    Optional<ModelVersion> findByModalityAndActiveIsTrue(ModelModality modality);

    List<ModelVersion> findByActiveIsTrue();

    boolean existsByModalityAndVersionLabel(ModelModality modality, String versionLabel);
}
