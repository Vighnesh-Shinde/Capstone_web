package com.project.depression.repository;

import com.project.depression.entity.CounselorJudgment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CounselorJudgmentRepository extends JpaRepository<CounselorJudgment, UUID> {
    Optional<CounselorJudgment> findByReportId(UUID reportId);
}
