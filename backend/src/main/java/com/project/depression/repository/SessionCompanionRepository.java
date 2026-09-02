package com.project.depression.repository;

import com.project.depression.entity.Session;
import com.project.depression.entity.SessionCompanion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SessionCompanionRepository extends JpaRepository<SessionCompanion, UUID> {

    List<SessionCompanion> findBySessionOrderByEnrolledAt(Session session);

    /**
     * Companions whose vector is still held, in a fixed order.
     *
     * The ordering is load-bearing, not cosmetic: the ML service labels these
     * "companion:0", "companion:1" by their position in the list it was sent,
     * and the report maps those labels back by the same index. An unordered
     * query would attribute the interpreter's match score to the mother.
     */
    List<SessionCompanion> findBySessionAndPurgedAtIsNullOrderByEnrolledAt(Session session);
}
