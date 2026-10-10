package com.vitaguard.backend_java.admin;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String adminUserId; // e.g. SYS_01 or system_admin

    private String adminName;

    @Column(nullable = false)
    private String action; // REGISTER_USER, ACTIVATE_USER, DEACTIVATE_USER, SUSPEND_USER, REACTIVATE_USER, etc.

    private Long targetUserId;

    private String targetName;

    private String targetRole;

    @Column(nullable = false)
    private Instant timestamp = Instant.now();

    private String oldStatus;

    private String newStatus;

    @Column(length = 1000)
    private String description;

    public AuditLog() {}

    public AuditLog(
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
        this.adminUserId = adminUserId;
        this.adminName = adminName;
        this.action = action;
        this.targetUserId = targetUserId;
        this.targetName = targetName;
        this.targetRole = targetRole;
        this.oldStatus = oldStatus;
        this.newStatus = newStatus;
        this.description = description;
        this.timestamp = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAdminUserId() {
        return adminUserId;
    }

    public void setAdminUserId(String adminUserId) {
        this.adminUserId = adminUserId;
    }

    public String getAdminName() {
        return adminName;
    }

    public void setAdminName(String adminName) {
        this.adminName = adminName;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public Long getTargetUserId() {
        return targetUserId;
    }

    public void setTargetUserId(Long targetUserId) {
        this.targetUserId = targetUserId;
    }

    public String getTargetName() {
        return targetName;
    }

    public void setTargetName(String targetName) {
        this.targetName = targetName;
    }

    public String getTargetRole() {
        return targetRole;
    }

    public void setTargetRole(String targetRole) {
        this.targetRole = targetRole;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public String getOldStatus() {
        return oldStatus;
    }

    public void setOldStatus(String oldStatus) {
        this.oldStatus = oldStatus;
    }

    public String getNewStatus() {
        return newStatus;
    }

    public void setNewStatus(String newStatus) {
        this.newStatus = newStatus;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
