package com.project.depression.service;

import com.project.depression.dto.CounselorJudgmentRequest;
import com.project.depression.dto.CounselorJudgmentResponse;
import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionRepository;
import com.project.depression.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class CounselorJudgmentService {

    private final SessionRepository sessionRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;
    private final UserRepository userRepository;
    private final DatasetEligibilityService datasetEligibilityService;
    private final AuditLogService auditLogService;

    public CounselorJudgmentService(
            SessionRepository sessionRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            UserRepository userRepository,
            DatasetEligibilityService datasetEligibilityService,
            AuditLogService auditLogService
    ) {
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.userRepository = userRepository;
        this.datasetEligibilityService = datasetEligibilityService;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public CounselorJudgmentResponse submit(String counselorEmail, UUID sessionId, CounselorJudgmentRequest request) {
        Session session = getOwnedSession(counselorEmail, sessionId);

        if (session.getStatus() != SessionStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot submit a judgment before the report is completed");
        }

        Report report = reportRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Report not found for session " + sessionId));

        User counselor = userRepository.findByEmail(counselorEmail)
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));

        Prediction assessment;
        try {
            assessment = Prediction.valueOf(request.assessment());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "assessment must be 'depressed' or 'not_depressed'");
        }

        CounselorJudgment judgment = judgmentRepository.findByReportId(report.getId())
                .orElseGet(() -> CounselorJudgment.builder().report(report).counselor(counselor).build());
        judgment.setAssessment(assessment);
        judgment.setObservation(request.observation());
        judgment = judgmentRepository.save(judgment);

        datasetEligibilityService.evaluate(session);

        auditLogService.log(counselor, "JUDGMENT_SUBMITTED", "SESSION", sessionId, assessment.name());

        return toResponse(judgment, report.getPrediction());
    }

    @Transactional(readOnly = true)
    public CounselorJudgmentResponse get(String counselorEmail, UUID sessionId) {
        Session session = getOwnedSession(counselorEmail, sessionId);
        Report report = reportRepository.findBySessionId(sessionId).orElse(null);
        if (report == null) {
            return null;
        }
        return judgmentRepository.findByReportId(report.getId())
                .map(j -> toResponse(j, report.getPrediction()))
                .orElse(null);
    }

    private Session getOwnedSession(String counselorEmail, UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + sessionId));
        if (!session.getCounselor().getEmail().equalsIgnoreCase(counselorEmail)) {
            throw new AccessDeniedException("You do not have access to this session");
        }
        return session;
    }

    private CounselorJudgmentResponse toResponse(CounselorJudgment judgment, Prediction aiPrediction) {
        String agreement = judgment.getAssessment() == aiPrediction ? "AGREE" : "DISAGREE";
        return new CounselorJudgmentResponse(
                judgment.getAssessment().name(),
                judgment.getObservation(),
                agreement,
                judgment.getSubmittedAt()
        );
    }
}
