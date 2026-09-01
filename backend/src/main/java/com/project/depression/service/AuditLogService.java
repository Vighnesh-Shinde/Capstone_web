package com.project.depression.service;

import com.project.depression.dto.AuditLogResponse;
import com.project.depression.dto.PageResponse;
import com.project.depression.entity.AuditLog;
import com.project.depression.entity.User;
import com.project.depression.repository.AuditLogRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public void log(User actor, String action, String targetType, UUID targetId, String metadata) {
        AuditLog entry = AuditLog.builder()
                .actor(actor)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .metadata(metadata)
                .build();
        auditLogRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> list(Pageable pageable) {
        return PageResponse.from(auditLogRepository.findAllByOrderByCreatedAtDesc(pageable).map(log -> new AuditLogResponse(
                log.getId(),
                log.getActor() == null ? null : log.getActor().getName(),
                log.getAction(),
                log.getTargetType(),
                log.getTargetId(),
                log.getMetadata(),
                log.getCreatedAt()
        )));
    }
}
