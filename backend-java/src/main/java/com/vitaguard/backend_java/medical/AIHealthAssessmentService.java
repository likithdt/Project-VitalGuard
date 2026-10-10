package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import com.vitaguard.backend_java.user.VitalRepository;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class AIHealthAssessmentService {

    private final AIHealthAssessmentRepository aiRepository;
    private final VitalRepository vitalRepository;
    private RestTemplate restTemplate;

    public AIHealthAssessmentService(AIHealthAssessmentRepository aiRepository, VitalRepository vitalRepository) {
        this.aiRepository = aiRepository;
        this.vitalRepository = vitalRepository;
        
        // Configure RestTemplate with timeouts for graceful failover
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(1500);
        factory.setReadTimeout(1500);
        this.restTemplate = new RestTemplate(factory);
    }

    public void setRestTemplate(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public AIHealthAssessment performAssessment(Vital current, List<Vital> history, RiskResult ruleRisk) {
        String patientUid = current.getPatientUid();

        // 1. Calculate Baseline & Anomaly
        Map<String, Object> baselineResult = calculateBaselineAndAnomaly(current, history);
        int anomalyScore = (int) baselineResult.get("anomalyScore");
        boolean anomalyDetected = (boolean) baselineResult.get("anomalyDetected");

        // 2. Deterioration Prediction via Python ML Service
        double deteriorationProbability = 0.0;
        List<String> explanations = new ArrayList<>();
        
        try {
            Map<String, Object> request = new HashMap<>();
            request.put("heartRate", current.getHeartRate());
            request.put("spo2", current.getSpo2());
            request.put("temperature", current.getTemperature());

            List<Map<String, Object>> historyList = new ArrayList<>();
            for (Vital v : history) {
                Map<String, Object> hm = new HashMap<>();
                hm.put("heartRate", v.getHeartRate());
                hm.put("spo2", v.getSpo2());
                hm.put("temperature", v.getTemperature());
                hm.put("recordedAt", v.getRecordedAt().toString());
                historyList.add(hm);
            }
            request.put("history", historyList);

            Map<?, ?> response = restTemplate.postForObject("http://localhost:8001/predict", request, Map.class);
            if (response != null) {
                if (response.containsKey("deteriorationProbability")) {
                    deteriorationProbability = ((Number) response.get("deteriorationProbability")).doubleValue();
                }
                if (response.containsKey("explanation")) {
                    List<?> expls = (List<?>) response.get("explanation");
                    for (Object e : expls) {
                        explanations.add(e.toString());
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[AI SERVICE] Failed to reach Python ML Service: " + e.getMessage() + ". Operating in graceful fallback mode.");
            deteriorationProbability = 0.0;
            explanations.add("AI service offline - operating in deterministic safety mode");
        }

        // 3. Risk Fusion
        // Fusion logic: 40% rule-based + 40% ML deterioration + 20% personalized anomaly
        int ruleScore = ruleRisk.getRiskScore();
        int finalScore = (int) (ruleScore * 0.4 + (deteriorationProbability * 100) * 0.4 + anomalyScore * 0.2);
        finalScore = Math.min(100, Math.max(0, finalScore));

        // Determine severity
        String severity = "LOW";
        if (finalScore >= 85 || "CRITICAL".equalsIgnoreCase(ruleRisk.getSeverity())) {
            severity = "CRITICAL";
        } else if (finalScore >= 70) {
            severity = "HIGH";
        } else if (finalScore >= 40) {
            severity = "MODERATE";
        }

        // Append baseline warnings to explanation if anomaly is detected
        if (anomalyDetected) {
            explanations.add("Current readings differ significantly from patient's recent baseline");
        }

        // Determine general trend
        String trend = "STABLE";
        if (history.size() > 0) {
            Vital last = history.get(0);
            double hrDiff = current.getHeartRate() - last.getHeartRate();
            double spo2Diff = current.getSpo2() - last.getSpo2();
            if (spo2Diff < -0.5 || hrDiff > 5.0) {
                trend = "WORSENING";
            } else if (spo2Diff > 0.5 || hrDiff < -5.0) {
                trend = "IMPROVING";
            }
        }

        String joinedExplanations = String.join("; ", explanations);

        AIHealthAssessment assessment = new AIHealthAssessment(
                patientUid,
                finalScore,
                severity,
                deteriorationProbability,
                anomalyScore,
                10, // predictionWindowMinutes
                trend,
                joinedExplanations
        );

        aiRepository.save(assessment);
        return assessment;
    }

    public Map<String, Object> calculateBaselineAndAnomaly(Vital current, List<Vital> history) {
        Map<String, Object> result = new HashMap<>();
        
        double meanHr = 75.0;
        double stdHr = 5.0;
        double meanSpo2 = 98.0;
        double stdSpo2 = 1.0;
        double meanTemp = 36.6;
        double stdTemp = 0.3;

        int size = Math.min(history.size(), 30);
        if (size >= 3) {
            double sumHr = 0, sumSpo2 = 0, sumTemp = 0;
            for (int i = 0; i < size; i++) {
                Vital v = history.get(i);
                sumHr += v.getHeartRate();
                sumSpo2 += v.getSpo2();
                sumTemp += v.getTemperature();
            }
            meanHr = sumHr / size;
            meanSpo2 = sumSpo2 / size;
            meanTemp = sumTemp / size;

            double sqSumHr = 0, sqSumSpo2 = 0, sqSumTemp = 0;
            for (int i = 0; i < size; i++) {
                Vital v = history.get(i);
                sqSumHr += Math.pow(v.getHeartRate() - meanHr, 2);
                sqSumSpo2 += Math.pow(v.getSpo2() - meanSpo2, 2);
                sqSumTemp += Math.pow(v.getTemperature() - meanTemp, 2);
            }
            // Set minimum standard deviations to prevent tiny/zero divisions
            stdHr = Math.max(3.0, Math.sqrt(sqSumHr / size));
            stdSpo2 = Math.max(1.0, Math.sqrt(sqSumSpo2 / size));
            stdTemp = Math.max(0.2, Math.sqrt(sqSumTemp / size));
        }

        // Z-score calculation
        double zHr = Math.abs(current.getHeartRate() - meanHr) / stdHr;
        double zSpo2 = Math.abs(current.getSpo2() - meanSpo2) / stdSpo2;
        double zTemp = Math.abs(current.getTemperature() - meanTemp) / stdTemp;

        boolean anomalyDetected = zHr > 2.0 || zSpo2 > 2.0 || zTemp > 2.0;
        int anomalyScore = (int) Math.min(100.0, Math.max(0.0, (zHr + zSpo2 + zTemp) * 15.0));

        result.put("meanHr", meanHr);
        result.put("stdHr", stdHr);
        result.put("meanSpo2", meanSpo2);
        result.put("stdSpo2", stdSpo2);
        result.put("meanTemp", meanTemp);
        result.put("stdTemp", stdTemp);
        result.put("anomalyDetected", anomalyDetected);
        result.put("anomalyScore", anomalyScore);

        return result;
    }
}
