package com.project.depression.repository;

import com.project.depression.entity.Report;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ReportRepository extends JpaRepository<Report, UUID> {
    Optional<Report> findBySessionId(UUID sessionId);
}
