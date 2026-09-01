package com.project.depression.repository;

import com.project.depression.entity.ApplicationStatus;
import com.project.depression.entity.CounselorApplication;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CounselorApplicationRepository extends JpaRepository<CounselorApplication, UUID> {
    Optional<CounselorApplication> findByEmail(String email);
    boolean existsByEmail(String email);
    Page<CounselorApplication> findByStatusOrderBySubmittedAtDesc(ApplicationStatus status, Pageable pageable);
    Page<CounselorApplication> findAllByOrderBySubmittedAtDesc(Pageable pageable);
    long countByStatus(ApplicationStatus status);
}
