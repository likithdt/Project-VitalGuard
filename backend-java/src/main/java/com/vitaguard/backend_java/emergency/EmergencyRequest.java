package com.vitaguard.backend_java.emergency;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "emergency_requests")
public class EmergencyRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String patientUid; // User's uid (e.g. LKT01)
    private String guardianUid; // Guardian/Family member uid if requested on behalf
    private String pickupAddress; // Textual pickup location address
    private String emergencyType; // e.g. Cardiac, Trauma, Respiratory, Emergency

    private Double latitude;
    private Double longitude;

    @Column(columnDefinition = "TEXT")
    private String symptoms; // comma-separated

    @Column(columnDefinition = "TEXT")
    private String symptomDescription;

    private String requiredDepartment;

    private Long hospitalId;
    private Long doctorId;
    private Long ambulanceId;

    private String status = "CREATED"; // CREATED, SEARCHING_HOSPITAL, HOSPITAL_ASSIGNED, etc.

    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime assignedAt;
    private LocalDateTime completedAt;

    private Boolean cancelled = false;
    private Boolean smsSent = false;
    private Boolean ambulanceDispatched = false;
    private Boolean requiresAmbulance = null;
    private String ambulanceDecision = "PENDING"; // PENDING, REQUIRED, NOT_REQUIRED

    private Integer riskScore;
    private String severity;
    private String detectedVitals;

    public EmergencyRequest() {}

    public EmergencyRequest(String patientUid, Double latitude, Double longitude, String symptoms, String symptomDescription) {
        this.patientUid = patientUid;
        this.latitude = latitude;
        this.longitude = longitude;
        this.symptoms = symptoms;
        this.symptomDescription = symptomDescription;
        this.createdAt = LocalDateTime.now();
        this.status = "CREATED";
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPatientUid() { return patientUid; }
    public void setPatientUid(String patientUid) { this.patientUid = patientUid; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getSymptoms() { return symptoms; }
    public void setSymptoms(String symptoms) { this.symptoms = symptoms; }

    public String getSymptomDescription() { return symptomDescription; }
    public void setSymptomDescription(String symptomDescription) { this.symptomDescription = symptomDescription; }

    public String getRequiredDepartment() { return requiredDepartment; }
    public void setRequiredDepartment(String requiredDepartment) { this.requiredDepartment = requiredDepartment; }

    public Long getHospitalId() { return hospitalId; }
    public void setHospitalId(Long hospitalId) { this.hospitalId = hospitalId; }

    public Long getDoctorId() { return doctorId; }
    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }

    public Long getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(Long ambulanceId) { this.ambulanceId = ambulanceId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getAcceptedAt() { return acceptedAt; }
    public void setAcceptedAt(LocalDateTime acceptedAt) { this.acceptedAt = acceptedAt; }

    public LocalDateTime getAssignedAt() { return assignedAt; }
    public void setAssignedAt(LocalDateTime assignedAt) { this.assignedAt = assignedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public Boolean getCancelled() { return cancelled; }
    public void setCancelled(Boolean cancelled) { this.cancelled = cancelled; }

    public Boolean getSmsSent() { return smsSent; }
    public void setSmsSent(Boolean smsSent) { this.smsSent = smsSent; }

    public Boolean getAmbulanceDispatched() { return ambulanceDispatched; }
    public void setAmbulanceDispatched(Boolean ambulanceDispatched) { this.ambulanceDispatched = ambulanceDispatched; }

    public Boolean getRequiresAmbulance() { return requiresAmbulance; }
    public void setRequiresAmbulance(Boolean requiresAmbulance) {
        this.requiresAmbulance = requiresAmbulance;
        if (Boolean.TRUE.equals(requiresAmbulance)) {
            this.ambulanceDecision = "REQUIRED";
        } else if (Boolean.FALSE.equals(requiresAmbulance)) {
            this.ambulanceDecision = "NOT_REQUIRED";
        } else {
            this.ambulanceDecision = "PENDING";
        }
    }

    public String getAmbulanceDecision() { return ambulanceDecision; }
    public void setAmbulanceDecision(String ambulanceDecision) {
        this.ambulanceDecision = ambulanceDecision;
        if ("REQUIRED".equalsIgnoreCase(ambulanceDecision)) {
            this.requiresAmbulance = true;
        } else if ("NOT_REQUIRED".equalsIgnoreCase(ambulanceDecision)) {
            this.requiresAmbulance = false;
        } else {
            this.requiresAmbulance = null;
        }
    }

    public Integer getRiskScore() { return riskScore; }
    public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getDetectedVitals() { return detectedVitals; }
    public void setDetectedVitals(String detectedVitals) { this.detectedVitals = detectedVitals; }

    public String getGuardianUid() { return guardianUid; }
    public void setGuardianUid(String guardianUid) { this.guardianUid = guardianUid; }

    public String getPickupAddress() { return pickupAddress; }
    public void setPickupAddress(String pickupAddress) { this.pickupAddress = pickupAddress; }

    public String getEmergencyType() { return emergencyType; }
    public void setEmergencyType(String emergencyType) { this.emergencyType = emergencyType; }
}
