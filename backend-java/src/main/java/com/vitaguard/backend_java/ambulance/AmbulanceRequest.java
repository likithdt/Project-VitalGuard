package com.vitaguard.backend_java.ambulance;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "ambulance_requests")
public class AmbulanceRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long emergencyId;

    @Column(nullable = false)
    private Long ambulanceId;

    private String status = "PENDING"; // PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED

    private LocalDateTime requestedAt;

    private LocalDateTime respondedAt;

    private Double distanceKm;

    private Integer etaMinutes;

    public AmbulanceRequest() {}

    public AmbulanceRequest(Long emergencyId, Long ambulanceId, Double distanceKm, Integer etaMinutes) {
        this.emergencyId = emergencyId;
        this.ambulanceId = ambulanceId;
        this.distanceKm = distanceKm;
        this.etaMinutes = etaMinutes;
        this.requestedAt = LocalDateTime.now();
        this.status = "PENDING";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmergencyId() { return emergencyId; }
    public void setEmergencyId(Long emergencyId) { this.emergencyId = emergencyId; }

    public Long getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(Long ambulanceId) { this.ambulanceId = ambulanceId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getRequestedAt() { return requestedAt; }
    public void setRequestedAt(LocalDateTime requestedAt) { this.requestedAt = requestedAt; }

    public LocalDateTime getRespondedAt() { return respondedAt; }
    public void setRespondedAt(LocalDateTime respondedAt) { this.respondedAt = respondedAt; }

    public Double getDistanceKm() { return distanceKm; }
    public void setDistanceKm(Double distanceKm) { this.distanceKm = distanceKm; }

    public Integer getEtaMinutes() { return etaMinutes; }
    public void setEtaMinutes(Integer etaMinutes) { this.etaMinutes = etaMinutes; }
}