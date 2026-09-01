package com.project.depression.service;

import com.project.depression.dto.*;
import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionRepository;
import com.project.depression.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
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

    public SessionService(
            SessionRepository sessionRepository,
            UserRepository userRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            SessionProcessingService sessionProcessingService,
            FileStorageService fileStorageService,
            ParticipantService participantService
    ) {
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.sessionProcessingService = sessionProcessingService;
        this.fileStorageService = fileStorageService;
        this.participantService = participantService;
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

    @Transactional(readOnly = true)
    public PageResponse<SessionResponse> listSessions(String counselorEmail, Pageable pageable) {
        User counselor = userRepository.findByEmail(counselorEmail)
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));

        Page<Session> sessions = sessionRepository.findByCounselorOrderByCreatedAtDesc(counselor, pageable);
        Page<SessionResponse> mapped = sessions.map(s -> {
            Report report = reportRepository.findBySessionId(s.getId()).orElse(null);
            return toSessionResponse(s, report == null ? null : report.getPrediction(), report == null ? null : report.getConfidenceScore());
        });
        return PageResponse.from(mapped);
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
                session.getParticipantRef(),
                session.getStatus().name(),
                prediction == null ? null : prediction.name(),
                confidenceScore,
                session.getCreatedAt(),
                session.getUpdatedAt()
        );
    }
}
