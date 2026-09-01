package com.project.depression.repository;

import com.project.depression.entity.VerificationDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VerificationDocumentRepository extends JpaRepository<VerificationDocument, UUID> {
    List<VerificationDocument> findByApplicationId(UUID applicationId);
}
