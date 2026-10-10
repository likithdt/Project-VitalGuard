package com.vitaguard.backend_java.admin;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public AuditLog logAction(
            String adminUserId,
            String adminName,
            String action,
            Long targetUserId,
            String targetName,
            String targetRole,
            String oldStatus,
            String newStatus,
            String description
    ) {
        AuditLog entry = new AuditLog(
                adminUserId != null ? adminUserId : "SYSTEM_ADMIN",
                adminName != null ? adminName : "System Administrator",
                action,
                targetUserId,
                targetName,
                targetRole,
                oldStatus,
                newStatus,
                description
        );
        return auditLogRepository.save(entry);
    }

    public List<AuditLog> getAllAuditLogs() {
        return auditLogRepository.findAllByOrderByTimestampDesc();
    }
}
