package com.vitaguard.backend_java.hospital;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "hospital_assignments")
public class HospitalAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long emergencyId;

    @Column(nullable = false)
    private Long hospitalId;

    @Column(nullable = false)
    private String status = "PENDING"; // PENDING, ACCEPTED, REJECTED, CANCELLED

    private String reason; // optional rejection or notes reason

    private LocalDateTime requestedAt;
    private LocalDateTime respondedAt;

    public HospitalAssignment() {}

    public HospitalAssignment(Long emergencyId, Long hospitalId) {
        this.emergencyId = emergencyId;
        this.hospitalId = hospitalId;
        this.status = "PENDING";
        this.requestedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmergencyId() { return emergencyId; }
    public void setEmergencyId(Long emergencyId) { this.emergencyId = emergencyId; }

    public Long getHospitalId() { return hospitalId; }
    public void setHospitalId(Long hospitalId) { this.hospitalId = hospitalId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public LocalDateTime getRequestedAt() { return requestedAt; }
    public void setRequestedAt(LocalDateTime requestedAt) { this.requestedAt = requestedAt; }

    public LocalDateTime getRespondedAt() { return respondedAt; }
    public void setRespondedAt(LocalDateTime respondedAt) { this.respondedAt = respondedAt; }
}

