package com.project.depression.service;

import com.project.depression.dto.ParticipantDetailResponse;
import com.project.depression.dto.ParticipantResponse;
import com.project.depression.dto.ParticipantSessionResponse;
import com.project.depression.entity.CounselorJudgment;
import com.project.depression.entity.Participant;
import com.project.depression.entity.Report;
import com.project.depression.entity.Session;
import com.project.depression.entity.User;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.ParticipantRepository;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class ParticipantService {

    private final ParticipantRepository participantRepository;
    private final SessionRepository sessionRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;

    public ParticipantService(
            ParticipantRepository participantRepository,
            SessionRepository sessionRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository
    ) {
        this.participantRepository = participantRepository;
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
    }

    /**
     * Resolves the participant for a new session: reuses the counselor's
     * existing participant with this exact ref if one exists (the "returning
     * participant" case), otherwise creates one. Either way, touches
     * last_session_at so the picker can sort by recency.
     */
    @Transactional
    public Participant findOrCreate(User counselor, String participantRef) {
        Participant participant = participantRepository.findByCounselorAndParticipantRef(counselor, participantRef)
                .orElseGet(() -> Participant.builder()
                        .counselor(counselor)
                        .participantRef(participantRef)
                        .build());
        participant.setLastSessionAt(Instant.now());
        return participantRepository.save(participant);
    }

    @Transactional(readOnly = true)
    public List<ParticipantResponse> listForCounselor(User counselor) {
        return participantRepository.findByCounselorOrderByLastSessionAtDesc(counselor).stream()
                .map(p -> new ParticipantResponse(
                        p.getId(),
                        p.getParticipantRef(),
                        sessionRepository.countByParticipant(p),
                        p.getCreatedAt(),
                        p.getLastSessionAt()
                ))
                .toList();
    }

    /**
     * A participant's full history, oldest session first.
     *
     * This is the view a single session's report can't give: whether someone is
     * improving, holding steady or deteriorating across visits. Both the AI's
     * confidence and the counselor's own recorded assessment are returned for
     * each session so the two can be compared over time rather than the AI
     * being read alone.
     */
    @Transactional(readOnly = true)
    public ParticipantDetailResponse getDetail(User counselor, UUID participantId) {
        Participant participant = participantRepository.findById(participantId)
                .orElseThrow(() -> new NoSuchElementException("Participant not found: " + participantId));

        if (!participant.getCounselor().getId().equals(counselor.getId())) {
            throw new AccessDeniedException("You do not have access to this participant");
        }

        List<ParticipantSessionResponse> sessions = sessionRepository
                .findByParticipantOrderByCreatedAtAsc(participant).stream()
                .map(this::toTimelineEntry)
                .toList();

        return new ParticipantDetailResponse(
                participant.getId(),
                participant.getParticipantRef(),
                sessions.size(),
                participant.getCreatedAt(),
                participant.getLastSessionAt(),
                sessions
        );
    }

    private ParticipantSessionResponse toTimelineEntry(Session session) {
        Optional<Report> reportOpt = reportRepository.findBySessionId(session.getId());

        String prediction = null;
        Double confidence = null;
        String assessment = null;
        String agreement = null;

        if (reportOpt.isPresent()) {
            Report report = reportOpt.get();
            prediction = report.getPrediction().name();
            confidence = report.getConfidenceScore();

            Optional<CounselorJudgment> judgmentOpt = judgmentRepository.findByReportId(report.getId());
            if (judgmentOpt.isPresent()) {
                CounselorJudgment judgment = judgmentOpt.get();
                assessment = judgment.getAssessment().name();
                agreement = judgment.getAssessment() == report.getPrediction() ? "AGREE" : "DISAGREE";
            }
        }

        return new ParticipantSessionResponse(
                session.getId(), session.getStatus().name(),
                prediction, confidence, assessment, agreement, session.getCreatedAt());
    }
}
