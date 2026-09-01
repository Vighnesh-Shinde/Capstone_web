package com.project.depression.repository;

import com.project.depression.entity.Session;
import com.project.depression.entity.SessionFeatures;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SessionFeaturesRepository extends JpaRepository<SessionFeatures, UUID> {
    Optional<SessionFeatures> findBySessionId(UUID sessionId);
    Optional<SessionFeatures> findBySession(Session session);
}
