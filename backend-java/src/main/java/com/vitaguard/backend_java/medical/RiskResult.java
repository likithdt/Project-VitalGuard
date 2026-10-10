package com.vitaguard.backend_java.medical;

import java.util.List;

public class RiskResult {
    private int riskScore;
    private String severity; // LOW, MODERATE, HIGH, CRITICAL
    private List<String> detectedAnomalies;
    private String explanation;

    public RiskResult() {}

    public RiskResult(int riskScore, String severity, List<String> detectedAnomalies, String explanation) {
        this.riskScore = riskScore;
        this.severity = severity;
        this.detectedAnomalies = detectedAnomalies;
        this.explanation = explanation;
    }

    public int getRiskScore() { return riskScore; }
    public void setRiskScore(int riskScore) { this.riskScore = riskScore; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public List<String> getDetectedAnomalies() { return detectedAnomalies; }
    public void setDetectedAnomalies(List<String> detectedAnomalies) { this.detectedAnomalies = detectedAnomalies; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }
}
