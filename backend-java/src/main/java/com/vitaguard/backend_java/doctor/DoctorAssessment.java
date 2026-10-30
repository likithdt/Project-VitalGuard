package com.vitaguard.backend_java.doctor;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "doctor_assessments")
public class DoctorAssessment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long emergencyId;

    @Column(nullable = false)
    private Long doctorId;

    @Column(nullable = false)
    private String status = "PENDING"; // PENDING, IN_PROGRESS, SUBMITTED

    // Initial Assessment Questions
    @Column(columnDefinition = "TEXT")
    private String currentSymptoms;

    @Column(columnDefinition = "TEXT")
    private String consciousnessLevel; // CONSCIOUS, UNRESPONSIVE, ALTERED

    @Column(columnDefinition = "TEXT")
    private String breathingStatus; // NORMAL, LABORED, ABSENT

    @Column(columnDefinition = "TEXT")
    private String immediateDangerSigns;

    @Column(columnDefinition = "TEXT")
    private String sensorReadingsEvaluation;

    // Clinical Observations
    @Column(columnDefinition = "TEXT")
    private String additionalObservations;

    @Column(columnDefinition = "TEXT")
    private String assessmentSummary;

    // Next Action
    @Column(columnDefinition = "TEXT")
    private String nextAction; // REMOTE_MONITORING, HOSPITAL_EVALUATION, AMBULANCE_REQUIRED, FURTHER_ASSESSMENT

    // Ambulance Decision
    private Boolean requiresAmbulance = null;
    private String ambulanceDecision = "PENDING"; // PENDING, REQUIRED, NOT_REQUIRED

    private LocalDateTime createdAt;
    private LocalDateTime startedAt;
    private LocalDateTime submittedAt;

    public DoctorAssessment() {}

    public DoctorAssessment(Long emergencyId, Long doctorId) {
        this.emergencyId = emergencyId;
        this.doctorId = doctorId;
        this.status = "PENDING";
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmergencyId() { return emergencyId; }
    public void setEmergencyId(Long emergencyId) { this.emergencyId = emergencyId; }

    public Long getDoctorId() { return doctorId; }
    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCurrentSymptoms() { return currentSymptoms; }
    public void setCurrentSymptoms(String currentSymptoms) { this.currentSymptoms = currentSymptoms; }

    public String getConsciousnessLevel() { return consciousnessLevel; }
    public void setConsciousnessLevel(String consciousnessLevel) { this.consciousnessLevel = consciousnessLevel; }

    public String getBreathingStatus() { return breathingStatus; }
    public void setBreathingStatus(String breathingStatus) { this.breathingStatus = breathingStatus; }

    public String getImmediateDangerSigns() { return immediateDangerSigns; }
    public void setImmediateDangerSigns(String immediateDangerSigns) { this.immediateDangerSigns = immediateDangerSigns; }

    public String getSensorReadingsEvaluation() { return sensorReadingsEvaluation; }
    public void setSensorReadingsEvaluation(String sensorReadingsEvaluation) { this.sensorReadingsEvaluation = sensorReadingsEvaluation; }

    public String getAdditionalObservations() { return additionalObservations; }
    public void setAdditionalObservations(String additionalObservations) { this.additionalObservations = additionalObservations; }

    public String getAssessmentSummary() { return assessmentSummary; }
    public void setAssessmentSummary(String assessmentSummary) { this.assessmentSummary = assessmentSummary; }

    public String getNextAction() { return nextAction; }
    public void setNextAction(String nextAction) { this.nextAction = nextAction; }

    public Boolean getRequiresAmbulance() { return requiresAmbulance; }
    public void setRequiresAmbulance(Boolean requiresAmbulance) { this.requiresAmbulance = requiresAmbulance; }

    public String getAmbulanceDecision() { return ambulanceDecision; }
    public void setAmbulanceDecision(String ambulanceDecision) { this.ambulanceDecision = ambulanceDecision; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }
}