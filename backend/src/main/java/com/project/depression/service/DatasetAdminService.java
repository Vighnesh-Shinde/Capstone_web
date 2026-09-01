package com.project.depression.service;

import com.project.depression.dto.*;
import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.DatasetSampleRepository;
import com.project.depression.repository.ReportRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class DatasetAdminService {

    private final DatasetSampleRepository datasetSampleRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;
    private final AuditLogService auditLogService;

    public DatasetAdminService(
            DatasetSampleRepository datasetSampleRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            AuditLogService auditLogService
    ) {
        this.datasetSampleRepository = datasetSampleRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public PageResponse<DatasetSampleResponse> list(DatasetEligibilityStatus status, Pageable pageable) {
        Page<DatasetSample> page = status == null
                ? datasetSampleRepository.findAllByOrderByCreatedAtDesc(pageable)
                : datasetSampleRepository.findByEligibilityStatusOrderByCreatedAtDesc(status, pageable);
        return PageResponse.from(page.map(this::toListResponse));
    }

    @Transactional
    public DatasetSampleDetailResponse getDetail(UUID sampleId, User admin) {
        DatasetSample sample = findSample(sampleId);
        auditLogService.log(admin, "DATASET_SAMPLE_VIEWED", "DATASET_SAMPLE", sampleId, null);
        return toDetailResponse(sample);
    }

    @Transactional
    public DatasetSampleDetailResponse approve(UUID sampleId, String notes, User admin) {
        DatasetSample sample = requireReviewable(sampleId);
        sample.setEligibilityStatus(DatasetEligibilityStatus.APPROVED);
        sample.setAdminNotes(notes);
        sample.setAdminReviewedBy(admin);
        sample.setAdminReviewedAt(Instant.now());
        sample = datasetSampleRepository.save(sample);

        auditLogService.log(admin, "DATASET_SAMPLE_APPROVED", "DATASET_SAMPLE", sampleId, notes);
        return toDetailResponse(sample);
    }

    @Transactional
    public DatasetSampleDetailResponse reject(UUID sampleId, String notes, User admin) {
        DatasetSample sample = requireReviewable(sampleId);
        sample.setEligibilityStatus(DatasetEligibilityStatus.REJECTED);
        sample.setAdminNotes(notes);
        sample.setAdminReviewedBy(admin);
        sample.setAdminReviewedAt(Instant.now());
        sample = datasetSampleRepository.save(sample);

        auditLogService.log(admin, "DATASET_SAMPLE_REJECTED", "DATASET_SAMPLE", sampleId, notes);
        return toDetailResponse(sample);
    }

    private DatasetSample requireReviewable(UUID sampleId) {
        DatasetSample sample = findSample(sampleId);
        if (sample.getEligibilityStatus() == DatasetEligibilityStatus.EXCLUDED_NO_CONSENT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sample is excluded due to missing research-reuse consent and cannot be reviewed");
        }
        return sample;
    }

    private DatasetSample findSample(UUID sampleId) {
        return datasetSampleRepository.findById(sampleId)
                .orElseThrow(() -> new NoSuchElementException("Dataset sample not found: " + sampleId));
    }

    private DatasetSampleResponse toListResponse(DatasetSample sample) {
        Session session = sample.getSession();
        Optional<Report> reportOpt = reportRepository.findBySessionId(session.getId());

        String aiPrediction = null;
        Double aiConfidence = null;
        String counselorAssessment = null;
        String agreement = null;

        if (reportOpt.isPresent()) {
            Report report = reportOpt.get();
            aiPrediction = report.getPrediction().name();
            aiConfidence = report.getConfidenceScore();
            Optional<CounselorJudgment> judgmentOpt = judgmentRepository.findByReportId(report.getId());
            if (judgmentOpt.isPresent()) {
                CounselorJudgment judgment = judgmentOpt.get();
                counselorAssessment = judgment.getAssessment().name();
                agreement = judgment.getAssessment() == report.getPrediction() ? "AGREE" : "DISAGREE";
            }
        }

        return new DatasetSampleResponse(
                sample.getId(), session.getId(), session.getParticipantRef(),
                aiPrediction, aiConfidence, counselorAssessment, agreement,
                sample.getEligibilityStatus().name(), sample.getCreatedAt()
        );
    }

    private DatasetSampleDetailResponse toDetailResponse(DatasetSample sample) {
        Session session = sample.getSession();
        Report report = reportRepository.findBySessionId(session.getId()).orElse(null);

        ModalityContributionsResponse modalityContributions = null;
        List<ExplanationFactorResponse> factors = List.of();
        String aiPrediction = null;
        Double aiConfidence = null;
        CounselorJudgmentResponse judgmentResponse = null;

        if (report != null) {
            aiPrediction = report.getPrediction().name();
            aiConfidence = report.getConfidenceScore();
            modalityContributions = new ModalityContributionsResponse(
                    report.getAudioContribution(), report.getTextContribution(), report.getVideoContribution());
            factors = report.getExplanationFactors().stream()
                    .sorted((a, b) -> Double.compare(Math.abs(b.getContributionScore()), Math.abs(a.getContributionScore())))
                    .map(f -> new ExplanationFactorResponse(f.getFeatureName(), f.getContributionScore(), f.getDescription(), f.getModality()))
                    .toList();

            Optional<CounselorJudgment> judgmentOpt = judgmentRepository.findByReportId(report.getId());
            if (judgmentOpt.isPresent()) {
                CounselorJudgment judgment = judgmentOpt.get();
                String agreement = judgment.getAssessment() == report.getPrediction() ? "AGREE" : "DISAGREE";
                judgmentResponse = new CounselorJudgmentResponse(
                        judgment.getAssessment().name(), judgment.getObservation(), agreement, judgment.getSubmittedAt());
            }
        }

        return new DatasetSampleDetailResponse(
                sample.getId(), session.getId(), session.getParticipantRef(),
                session.getCounselor().getName(), session.getCounselor().getEmail(),
                aiPrediction, aiConfidence, modalityContributions, factors, judgmentResponse,
                session.isConsentRecording(), session.isConsentAiAnalysis(), session.isConsentStorage(), session.isConsentResearchReuse(),
                sample.getEligibilityStatus().name(), sample.getAdminNotes(),
                sample.getAdminReviewedBy() == null ? null : sample.getAdminReviewedBy().getName(),
                sample.getAdminReviewedAt(), session.getCreatedAt(), sample.getCreatedAt()
        );
    }
}
