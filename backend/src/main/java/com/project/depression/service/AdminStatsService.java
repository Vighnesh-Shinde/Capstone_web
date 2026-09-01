package com.project.depression.service;

import com.project.depression.dto.AdminStatsResponse;
import com.project.depression.entity.ApplicationStatus;
import com.project.depression.entity.DatasetEligibilityStatus;
import com.project.depression.repository.CounselorApplicationRepository;
import com.project.depression.repository.DatasetSampleRepository;
import com.project.depression.repository.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminStatsService {

    private final CounselorApplicationRepository applicationRepository;
    private final SessionRepository sessionRepository;
    private final DatasetSampleRepository datasetSampleRepository;

    public AdminStatsService(
            CounselorApplicationRepository applicationRepository,
            SessionRepository sessionRepository,
            DatasetSampleRepository datasetSampleRepository
    ) {
        this.applicationRepository = applicationRepository;
        this.sessionRepository = sessionRepository;
        this.datasetSampleRepository = datasetSampleRepository;
    }

    @Transactional(readOnly = true)
    public AdminStatsResponse getStats() {
        return new AdminStatsResponse(
                applicationRepository.countByStatus(ApplicationStatus.PENDING),
                applicationRepository.countByStatus(ApplicationStatus.APPROVED),
                sessionRepository.count(),
                datasetSampleRepository.countByEligibilityStatus(DatasetEligibilityStatus.AWAITING_JUDGMENT),
                datasetSampleRepository.countByEligibilityStatus(DatasetEligibilityStatus.UNDER_REVIEW),
                datasetSampleRepository.countByEligibilityStatus(DatasetEligibilityStatus.APPROVED),
                datasetSampleRepository.countByEligibilityStatus(DatasetEligibilityStatus.REJECTED),
                datasetSampleRepository.countByEligibilityStatus(DatasetEligibilityStatus.EXCLUDED_NO_CONSENT)
        );
    }
}
