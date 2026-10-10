package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class DeterministicRiskAnalysisService implements RiskAnalysisService {

    @Override
    public RiskResult analyzeRisk(Vital current, List<Vital> history) {
        int score = 0;
        List<String> anomalies = new ArrayList<>();
        List<String> explanations = new ArrayList<>();

        double hr = current.getHeartRate() != null ? current.getHeartRate() : 75.0;
        double spo2 = current.getSpo2() != null ? current.getSpo2() : 98.0;
        double temp = current.getTemperature() != null ? current.getTemperature() : 36.6;

        // 1. Heart Rate Analysis
        if (hr > 140 || hr < 40) {
            score += 40;
            anomalies.add("Extreme Heart Rate: " + hr + " BPM");
            explanations.add("Critical heart rate deviation detected.");
        } else if (hr > 100 || hr < 50) {
            score += 15;
            anomalies.add("Abnormal Heart Rate: " + hr + " BPM");
            explanations.add("Moderate heart rate deviation detected.");
        }

        // 2. SpO2 Analysis
        if (spo2 < 85) {
            score += 40;
            anomalies.add("Critical SpO2: " + spo2 + "%");
            explanations.add("Severe oxygen desaturation detected.");
        } else if (spo2 < 92) {
            score += 20;
            anomalies.add("Low SpO2: " + spo2 + "%");
            explanations.add("Sub-optimal oxygen saturation levels.");
        } else if (spo2 < 95) {
            score += 10;
            anomalies.add("Borderline SpO2: " + spo2 + "%");
            explanations.add("Oxygen levels are slightly below normal.");
        }

        // 3. Temperature Analysis
        if (temp > 39.5 || temp < 35.0) {
            score += 20;
            anomalies.add("Extreme Temperature: " + temp + " °C");
            explanations.add("Severe body temperature anomaly.");
        } else if (temp > 38.0) {
            score += 10;
            anomalies.add("Elevated Temperature: " + temp + " °C");
            explanations.add("Fever detected.");
        }

        // 4. Rate of Change / Trend Analysis
        if (history != null && !history.isEmpty()) {
            Vital last = history.get(0); // Assuming sorted desc (latest first)
            double prevSpo2 = last.getSpo2() != null ? last.getSpo2() : 98.0;
            double prevHr = last.getHeartRate() != null ? last.getHeartRate() : 75.0;
            double prevTemp = last.getTemperature() != null ? last.getTemperature() : 36.6;

            double spo2Diff = prevSpo2 - spo2; // positive means dropping
            double hrDiff = Math.abs(hr - prevHr);
            double tempDiff = Math.abs(temp - prevTemp);

            if (spo2Diff >= 3.0) {
                score += 15;
                anomalies.add("Rapid SpO2 drop: -" + spo2Diff + "%");
                explanations.add("Oxygen levels are falling rapidly.");
            }
            if (hrDiff >= 20.0) {
                score += 15;
                anomalies.add("Sudden heart rate change: " + (hr > prevHr ? "+" : "-") + hrDiff + " BPM");
                explanations.add("Significant pulse instability detected.");
            }
            if (tempDiff >= 1.0) {
                score += 10;
                anomalies.add("Sudden temperature change: " + (temp > prevTemp ? "+" : "-") + tempDiff + " °C");
                explanations.add("Rapid thermal fluctuation detected.");
            }
        }

        // Cap score at 100
        int finalScore = Math.min(100, score);

        // Determine Severity
        String severity = "LOW";
        if (finalScore >= 80) {
            severity = "CRITICAL";
        } else if (finalScore >= 50) {
            severity = "HIGH";
        } else if (finalScore >= 25) {
            severity = "MODERATE";
        }

        String explanationSummary = explanations.isEmpty() ? "Vitals are within stable ranges." : String.join(" ", explanations);

        return new RiskResult(finalScore, severity, anomalies, explanationSummary);
    }
}
