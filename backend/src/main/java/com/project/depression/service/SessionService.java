package com.project.depression.service;

import com.project.depression.dto.*;
import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.ParticipantRepository;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionRepository;
import com.project.depression.repository.UserRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class SessionService {

    // Placeholder consent-text version identifier. The actual legal/ethical
    // wording shown to counselors lives in the frontend and is NOT authored
    // here — this only records which version was in effect when consent was
    // captured, for future auditing once real wording is finalized.
    private static final String CONSENT_VERSION = "v1-placeholder";

    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;
    private final SessionProcessingService sessionProcessingService;
    private final FileStorageService fileStorageService;
    private final ParticipantService participantService;
    private final ParticipantRepository participantRepository;

    public SessionService(
            SessionRepository sessionRepository,
            UserRepository userRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            SessionProcessingService sessionProcessingService,
            FileStorageService fileStorageService,
            ParticipantService participantService,
            ParticipantRepository participantRepository
    ) {
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.sessionProcessingService = sessionProcessingService;
        this.fileStorageService = fileStorageService;
        this.participantService = participantService;
        this.participantRepository = participantRepository;
    }

    // Deliberately not @Transactional: each save() below commits on its own,
    // so the session row is durably committed before the async ML processing
    // (running on another thread/connection) tries to read it. Wrapping this
    // in one transaction would race the async task against the commit.
    public SessionResponse createSession(
            String counselorEmail, String participantRef, MultipartFile video,
            boolean consentRecording, boolean consentAiAnalysis, boolean consentStorage, boolean consentResearchReuse
    ) {
        User counselor = userRepository.findByEmail(counselorEmail)
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));

        Participant participant = participantService.findOrCreate(counselor, participantRef);

        Session session = Session.builder()
                .counselor(counselor)
                .participantRef(participantRef)
                .participant(participant)
                .status(SessionStatus.UPLOADED)
                .consentRecording(consentRecording)
                .consentAiAnalysis(consentAiAnalysis)
                .consentStorage(consentStorage)
                .consentResearchReuse(consentResearchReuse)
                .consentVersion(CONSENT_VERSION)
                .consentRecordedAt(Instant.now())
                .build();
        session = sessionRepository.save(session);

        String storedPath = fileStorageService.storeSessionVideo(participant.getId(), session.getId(), video);
        session.setVideoPath(storedPath);
        session = sessionRepository.save(session);

        sessionProcessingService.processSessionAsync(session.getId());

        return toSessionResponse(session, null, null);
    }

    /**
     * The counselor's session list, with optional filters. Ownership is always
     * applied as a predicate rather than checked afterwards, so a counselor can
     * never page through another's sessions regardless of the other filters.
     */
    @Transactional(readOnly = true)
    public PageResponse<SessionResponse> listSessions(
            String counselorEmail, SessionStatus status, UUID participantId, String search, Pageable pageable
    ) {
        User counselor = userRepository.findByEmail(counselorEmail)
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));

        Page<Session> sessions = sessionRepository.findAll(
                ownedBy(counselor, status, participantId, search), pageable);
        Page<SessionResponse> mapped = sessions.map(s -> {
            Report report = reportRepository.findBySessionId(s.getId()).orElse(null);
            return toSessionResponse(s, report == null ? null : report.getPrediction(), report == null ? null : report.getConfidenceScore());
        });
        return PageResponse.from(mapped);
    }

    /**
     * Only the filters actually supplied become predicates. A JPQL query with
     * `:param IS NULL OR ...` guards breaks on PostgreSQL, which infers an
     * untyped null bind as bytea.
     */
    private static Specification<Session> ownedBy(
            User counselor, SessionStatus status, UUID participantId, String search
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("counselor"), counselor));

            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (participantId != null) {
                predicates.add(cb.equal(root.get("participant").get("id"), participantId));
            }
            if (search != null && !search.isBlank()) {
                predicates.add(cb.like(
                        cb.lower(root.get("participantRef")), "%" + search.trim().toLowerCase() + "%"));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    @Transactional(readOnly = true)
    public CounselorStatsResponse getStats(String counselorEmail) {
        User counselor = userRepository.findByEmail(counselorEmail)
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));

        long awaitingJudgment = sessionRepository
                .findAll(ownedBy(counselor, SessionStatus.COMPLETED, null, null)).stream()
                .filter(s -> reportRepository.findBySessionId(s.getId())
                        .map(r -> judgmentRepository.findByReportId(r.getId()).isEmpty())
                        .orElse(false))
                .count();

        return new CounselorStatsResponse(
                sessionRepository.countByCounselor(counselor),
                participantRepository.countByCounselor(counselor),
                sessionRepository.countByCounselorAndCreatedAtAfter(
                        counselor, Instant.now().minus(7, ChronoUnit.DAYS)),
                awaitingJudgment,
                sessionRepository.countByCounselorAndStatus(counselor, SessionStatus.PROCESSING)
                        + sessionRepository.countByCounselorAndStatus(counselor, SessionStatus.UPLOADED),
                sessionRepository.countByCounselorAndStatus(counselor, SessionStatus.FAILED)
        );
    }

    @Transactional
    public SessionResponse updateNotes(String counselorEmail, UUID sessionId, String notes) {
        Session session = getOwnedSession(counselorEmail, sessionId);
        session.setNotes(notes == null || notes.isBlank() ? null : notes.trim());
        session = sessionRepository.save(session);

        Report report = reportRepository.findBySessionId(sessionId).orElse(null);
        return toSessionResponse(session,
                report == null ? null : report.getPrediction(),
                report == null ? null : report.getConfidenceScore());
    }

    @Transactional(readOnly = true)
    public SessionResponse getSession(String counselorEmail, UUID sessionId) {
        Session session = getOwnedSession(counselorEmail, sessionId);
        Report report = reportRepository.findBySessionId(sessionId).orElse(null);
        return toSessionResponse(session, report == null ? null : report.getPrediction(), report == null ? null : report.getConfidenceScore());
    }

    @Transactional(readOnly = true)
    public ReportResponse getReport(String counselorEmail, UUID sessionId) {
        Session session = getOwnedSession(counselorEmail, sessionId);

        if (session.getStatus() != SessionStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Report not available yet; session status is " + session.getStatus());
        }

        Report report = reportRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Report not found for session " + sessionId));

        List<ExplanationFactorResponse> factors = report.getExplanationFactors().stream()
                .sorted((a, b) -> Double.compare(Math.abs(b.getContributionScore()), Math.abs(a.getContributionScore())))
                .map(f -> new ExplanationFactorResponse(f.getFeatureName(), f.getContributionScore(), f.getDescription(), f.getModality()))
                .toList();

        ModalityContributionsResponse modalityContributions = new ModalityContributionsResponse(
                report.getAudioContribution(), report.getTextContribution(), report.getVideoContribution());

        CounselorJudgmentResponse judgment = judgmentRepository.findByReportId(report.getId())
                .map(j -> new CounselorJudgmentResponse(
                        j.getAssessment().name(),
                        j.getObservation(),
                        j.getAssessment() == report.getPrediction() ? "AGREE" : "DISAGREE",
                        j.getSubmittedAt()))
                .orElse(null);

        return new ReportResponse(
                sessionId, report.getPrediction().name(), report.getConfidenceScore(),
                modalityContributions, factors, judgment, report.getCreatedAt());
    }

    private Session getOwnedSession(String counselorEmail, UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + sessionId));

        if (!session.getCounselor().getEmail().equalsIgnoreCase(counselorEmail)) {
            throw new AccessDeniedException("You do not have access to this session");
        }
        return session;
    }

    private SessionResponse toSessionResponse(Session session, Prediction prediction, Double confidenceScore) {
        return new SessionResponse(
                session.getId(),
                session.getParticipant() == null ? null : session.getParticipant().getId(),
                session.getParticipantRef(),
                session.getStatus().name(),
                prediction == null ? null : prediction.name(),
                confidenceScore,
                session.getNotes(),
                session.isConsentRecording(),
                session.isConsentAiAnalysis(),
                session.isConsentStorage(),
                session.isConsentResearchReuse(),
                session.getConsentVersion(),
                session.getConsentRecordedAt(),
                session.getConsentWithdrawnAt(),
                session.getVideoDeletedAt(),
                session.getCreatedAt(),
                session.getUpdatedAt()
        );
    }
}
