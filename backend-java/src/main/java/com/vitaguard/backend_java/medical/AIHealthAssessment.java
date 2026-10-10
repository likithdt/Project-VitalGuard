package com.vitaguard.backend_java.medical;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "ai_health_assessments")
public class AIHealthAssessment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String patientUid;

    private int riskScore;
    private String severity;
    private double deteriorationProbability;
    private int anomalyScore;
    private int predictionWindowMinutes;
    private String trend;

    @Column(columnDefinition = "TEXT")
    private String explanations;

    private LocalDateTime recordedAt;

    public AIHealthAssessment() {}

    public AIHealthAssessment(String patientUid, int riskScore, String severity, double deteriorationProbability, int anomalyScore, int predictionWindowMinutes, String trend, String explanations) {
        this.patientUid = patientUid;
        this.riskScore = riskScore;
        this.severity = severity;
        this.deteriorationProbability = deteriorationProbability;
        this.anomalyScore = anomalyScore;
        this.predictionWindowMinutes = predictionWindowMinutes;
        this.trend = trend;
        this.explanations = explanations;
        this.recordedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPatientUid() { return patientUid; }
    public void setPatientUid(String patientUid) { this.patientUid = patientUid; }

    public int getRiskScore() { return riskScore; }
    public void setRiskScore(int riskScore) { this.riskScore = riskScore; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public double getDeteriorationProbability() { return deteriorationProbability; }
    public void setDeteriorationProbability(double deteriorationProbability) { this.deteriorationProbability = deteriorationProbability; }

    public int getAnomalyScore() { return anomalyScore; }
    public void setAnomalyScore(int anomalyScore) { this.anomalyScore = anomalyScore; }

    public int getPredictionWindowMinutes() { return predictionWindowMinutes; }
    public void setPredictionWindowMinutes(int predictionWindowMinutes) { this.predictionWindowMinutes = predictionWindowMinutes; }

    public String getTrend() { return trend; }
    public void setTrend(String trend) { this.trend = trend; }

    public String getExplanations() { return explanations; }
    public void setExplanations(String explanations) { this.explanations = explanations; }

    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
