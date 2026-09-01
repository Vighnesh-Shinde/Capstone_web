package com.project.depression.service;

import com.project.depression.dto.AdminParticipantResponse;
import com.project.depression.entity.*;
import com.project.depression.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Consent withdrawal and right to erasure.
 *
 * Two deliberately different operations, because they answer different requests:
 *
 *   withdrawConsent  — "stop using my data for research". Removes the session
 *                      from the dataset and marks it, but keeps the clinical
 *                      record intact. This is reversible in principle and
 *                      leaves the counselor's notes and report alone.
 *
 *   eraseParticipant — "delete everything you hold about me". Destroys sessions,
 *                      reports, feature vectors, recordings and the participant
 *                      row. Not reversible.
 *
 * The audit entry survives an erasure by design: it records that an erasure
 * happened and who performed it, without retaining the erased content. Removing
 * that too would make the erasure itself untraceable.
 */
@Service
public class DataErasureService {

    private static final Logger log = LoggerFactory.getLogger(DataErasureService.class);

    private final ParticipantRepository participantRepository;
    private final SessionRepository sessionRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;
    private final DatasetSampleRepository datasetSampleRepository;
    private final SessionFeaturesRepository sessionFeaturesRepository;
    private final AuditLogService auditLogService;

    public DataErasureService(
            ParticipantRepository participantRepository,
            SessionRepository sessionRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            DatasetSampleRepository datasetSampleRepository,
            SessionFeaturesRepository sessionFeaturesRepository,
            AuditLogService auditLogService
    ) {
        this.participantRepository = participantRepository;
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.datasetSampleRepository = datasetSampleRepository;
        this.sessionFeaturesRepository = sessionFeaturesRepository;
        this.auditLogService = auditLogService;
    }

    /**
     * Participant lookup across every counselor, so an administrator can act on
     * an erasure request. Deliberately admin-only: it crosses the ownership
     * boundary a counselor is otherwise confined to.
     */
    @Transactional(readOnly = true)
    public List<AdminParticipantResponse> searchParticipants(String search) {
        String term = search == null ? "" : search.trim().toLowerCase();

        return participantRepository.findAll().stream()
                .filter(p -> term.isEmpty() || p.getParticipantRef().toLowerCase().contains(term))
                .sorted(Comparator.comparing(Participant::getLastSessionAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(100)
                .map(p -> new AdminParticipantResponse(
                        p.getId(),
                        p.getParticipantRef(),
                        p.getCounselor().getName(),
                        p.getCounselor().getEmail(),
                        sessionRepository.countByParticipant(p),
                        p.getCreatedAt(),
                        p.getLastSessionAt()))
                .toList();
    }

    /** Excludes a session from research use without touching the clinical record. */
    @Transactional
    public void withdrawConsent(UUID sessionId, User actor) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + sessionId));

        session.setConsentResearchReuse(false);
        session.setConsentWithdrawnAt(Instant.now());
        sessionRepository.save(session);

        datasetSampleRepository.findBySessionId(sessionId).ifPresent(sample -> {
            sample.setEligibilityStatus(DatasetEligibilityStatus.EXCLUDED_NO_CONSENT);
            sample.setAdminNotes("Consent withdrawn by the participant on " + Instant.now());
            datasetSampleRepository.save(sample);
        });

        auditLogService.log(actor, "CONSENT_WITHDRAWN", "SESSION", sessionId,
                "Removed from the research dataset; clinical record retained");
        log.info("Consent withdrawn for session {}", sessionId);
    }

    /**
     * Erases everything held about one participant.
     *
     * Order matters: children before parents, and files before rows — a crash
     * partway through should leave orphaned files rather than database rows
     * pointing at recordings that no longer exist.
     *
     * @return a short summary of what was destroyed, for the caller to show.
     */
    @Transactional
    public String eraseParticipant(UUID participantId, User actor) {
        Participant participant = participantRepository.findById(participantId)
                .orElseThrow(() -> new NoSuchElementException("Participant not found: " + participantId));

        String participantRef = participant.getParticipantRef();
        List<Session> sessions = sessionRepository.findByParticipant(participant);

        int filesDeleted = 0;
        for (Session session : sessions) {
            filesDeleted += deleteSessionFiles(session);

            sessionFeaturesRepository.findBySession(session)
                    .ifPresent(sessionFeaturesRepository::delete);
            datasetSampleRepository.findBySessionId(session.getId())
                    .ifPresent(datasetSampleRepository::delete);

            reportRepository.findBySessionId(session.getId()).ifPresent(report -> {
                judgmentRepository.findByReportId(report.getId()).ifPresent(judgmentRepository::delete);
                reportRepository.delete(report);
            });
        }

        // Uploads are stored under uploads/{participantId}/{sessionId}/, so
        // removing every session leaves the participant's directory behind as
        // an empty shell. "Erase everything" should leave nothing.
        filesDeleted += deleteParticipantDirectory(sessions);

        sessionRepository.deleteAll(sessions);
        participantRepository.delete(participant);

        String summary = sessions.size() + " session(s), " + filesDeleted + " file(s)";

        // Records that an erasure happened, and by whom — deliberately without
        // the erased content. An untraceable erasure would be worse than none.
        auditLogService.log(actor, "PARTICIPANT_ERASED", "PARTICIPANT", participantId,
                "Erased participant '" + participantRef + "': " + summary);
        log.info("Erased participant {} ({})", participantId, summary);

        return summary;
    }

    /**
     * Removes the now-empty uploads/{participantId}/ directory left behind once
     * every session directory under it has been deleted.
     *
     * Only removes it if it is genuinely empty — if anything unexpected is still
     * in there, leaving it for a human to inspect beats deleting blindly.
     */
    private int deleteParticipantDirectory(List<Session> sessions) {
        Path participantDir = sessions.stream()
                .map(Session::getVideoPath)
                .filter(java.util.Objects::nonNull)
                .map(path -> Path.of(path).getParent())          // .../{participantId}/{sessionId}
                .filter(java.util.Objects::nonNull)
                .map(Path::getParent)                            // .../{participantId}
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);

        if (participantDir == null || !Files.isDirectory(participantDir)) {
            return 0;
        }

        try (Stream<Path> entries = Files.list(participantDir)) {
            if (entries.findAny().isPresent()) {
                log.warn("Erasure: {} is not empty after removing sessions — left in place for inspection",
                        participantDir);
                return 0;
            }
        } catch (IOException e) {
            log.warn("Erasure: could not inspect {}", participantDir, e);
            return 0;
        }

        try {
            return Files.deleteIfExists(participantDir) ? 1 : 0;
        } catch (IOException e) {
            log.warn("Erasure: could not remove empty directory {}", participantDir, e);
            return 0;
        }
    }

    /**
     * Removes the session's upload directory, not just the video file — the
     * directory is per-session, so leaving it behind would leave an empty
     * artifact tree keyed by participant id.
     */
    private int deleteSessionFiles(Session session) {
        if (session.getVideoPath() == null) {
            return 0;
        }

        Path videoPath = Path.of(session.getVideoPath());
        Path sessionDir = videoPath.getParent();
        int deleted = 0;

        try {
            if (sessionDir != null && Files.isDirectory(sessionDir)) {
                try (Stream<Path> walk = Files.walk(sessionDir)) {
                    // Deepest first, so directories are empty when removed.
                    List<Path> paths = walk.sorted(Comparator.reverseOrder()).toList();
                    for (Path path : paths) {
                        if (Files.deleteIfExists(path)) {
                            deleted++;
                        }
                    }
                }
            } else if (Files.deleteIfExists(videoPath)) {
                deleted++;
            }
        } catch (IOException e) {
            // Reported, not swallowed — an erasure that silently left files on
            // disk would be a false assurance to the participant.
            log.error("Erasure: could not fully delete files for session {} at {}",
                    session.getId(), session.getVideoPath(), e);
            throw new IllegalStateException(
                    "Could not delete stored files for session " + session.getId()
                            + ". Nothing has been erased — resolve the file permission issue and retry.", e);
        }

        return deleted;
    }
}
