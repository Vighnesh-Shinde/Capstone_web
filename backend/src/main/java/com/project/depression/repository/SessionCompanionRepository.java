package com.project.depression.repository;

import com.project.depression.entity.Session;
import com.project.depression.entity.SessionCompanion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SessionCompanionRepository extends JpaRepository<SessionCompanion, UUID> {

    List<SessionCompanion> findBySessionOrderByEnrolledAt(Session session);

    /** Companions whose vector is still held for a session whose video is gone. */
    List<SessionCompanion> findBySessionAndPurgedAtIsNull(Session session);
}
