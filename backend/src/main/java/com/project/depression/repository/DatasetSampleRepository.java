package com.project.depression.repository;

import com.project.depression.entity.DatasetEligibilityStatus;
import com.project.depression.entity.DatasetSample;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DatasetSampleRepository extends JpaRepository<DatasetSample, UUID> {
    Optional<DatasetSample> findBySessionId(UUID sessionId);
    Page<DatasetSample> findByEligibilityStatusOrderByCreatedAtDesc(DatasetEligibilityStatus status, Pageable pageable);
    Page<DatasetSample> findAllByOrderByCreatedAtDesc(Pageable pageable);
    long countByEligibilityStatus(DatasetEligibilityStatus status);
}
