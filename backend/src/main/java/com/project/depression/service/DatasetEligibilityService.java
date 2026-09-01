package com.project.depression.service;

import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.DatasetSampleRepository;
import com.project.depression.repository.ReportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.Set;

/**
 * Evaluates/upserts a session's dataset_samples row. Called after report
 * completion and after judgment submission — never automatically marks a
 * session as an approved research sample; that decision is Admin's alone.
 */
@Service
public class DatasetEligibilityService {

    private static final Set<DatasetEligibilityStatus> FINAL_STATUSES =
            Set.of(DatasetEligibilityStatus.APPROVED, DatasetEligibilityStatus.REJECTED);

    private final DatasetSampleRepository datasetSampleRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;

    public DatasetEligibilityService(
            DatasetSampleRepository datasetSampleRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository
    ) {
        this.datasetSampleRepository = datasetSampleRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
    }

    @Transactional
    public void evaluate(Session session) {
        Optional<Report> reportOpt = reportRepository.findBySessionId(session.getId());
        if (reportOpt.isEmpty()) {
            return; // no report yet, nothing to evaluate
        }
        Report report = reportOpt.get();

        boolean judgmentPresent = judgmentRepository.findByReportId(report.getId()).isPresent();

        DatasetEligibilityStatus computed;
        if (!session.isConsentResearchReuse()) {
            computed = DatasetEligibilityStatus.EXCLUDED_NO_CONSENT;
        } else if (!judgmentPresent) {
            computed = DatasetEligibilityStatus.AWAITING_JUDGMENT;
        } else {
            computed = DatasetEligibilityStatus.UNDER_REVIEW;
        }

        DatasetSample sample = datasetSampleRepository.findBySessionId(session.getId())
                .orElseGet(() -> DatasetSample.builder().session(session).build());

        // Never silently overwrite a final admin decision.
        if (FINAL_STATUSES.contains(sample.getEligibilityStatus())) {
            return;
        }

        sample.setEligibilityStatus(computed);
        datasetSampleRepository.save(sample);
    }
}
