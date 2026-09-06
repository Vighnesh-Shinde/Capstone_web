package com.project.depression.repository;

import com.project.depression.entity.EnrollmentPassageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EnrollmentPassageRepository extends JpaRepository<EnrollmentPassageEntity, UUID> {

    Optional<EnrollmentPassageEntity> findByActiveIsTrue();

    Optional<EnrollmentPassageEntity> findByVersion(String version);

    List<EnrollmentPassageEntity> findAllByOrderByCreatedAtDesc();
}
