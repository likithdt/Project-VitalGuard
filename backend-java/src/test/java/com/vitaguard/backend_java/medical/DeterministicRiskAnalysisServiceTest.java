package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DeterministicRiskAnalysisServiceTest {

    private final DeterministicRiskAnalysisService riskService = new DeterministicRiskAnalysisService();

    @Test
    void testNormalVitals() {
        Vital current = new Vital("LKT01", 75.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        RiskResult result = riskService.analyzeRisk(current, null);

        assertEquals("LOW", result.getSeverity());
        assertTrue(result.getRiskScore() < 25);
    }

    @Test
    void testCriticalVitalsElevatedHRAndReducedSpO2() {
        Vital current = new Vital("LKT01", 145.0, 84.0, 120.0, 80.0, 100.0, 39.2, 16.0);
        RiskResult result = riskService.analyzeRisk(current, null);

        assertEquals("CRITICAL", result.getSeverity());
        assertTrue(result.getRiskScore() >= 80);
    }

    @Test
    void testSpO2DroppingAnomalyFromHistory() {
        Vital current = new Vital("LKT01", 75.0, 91.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        
        List<Vital> history = new ArrayList<>();
        Vital last = new Vital("LKT01", 75.0, 96.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        history.add(last);

        RiskResult result = riskService.analyzeRisk(current, history);
        
        // Base SpO2 under 92 adds 20. SpO2 drop of -5% adds 15. Total score = 35 -> MODERATE
        assertEquals("MODERATE", result.getSeverity());
        assertTrue(result.getDetectedAnomalies().contains("Rapid SpO2 drop: -5.0%"));
    }
}
