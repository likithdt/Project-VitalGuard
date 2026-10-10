package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import com.vitaguard.backend_java.user.VitalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.client.RestTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

class AIHealthAssessmentServiceTest {

    private AIHealthAssessmentRepository aiRepository;
    private VitalRepository vitalRepository;
    private RestTemplate restTemplate;
    private AIHealthAssessmentService aiService;

    @BeforeEach
    void setUp() {
        aiRepository = Mockito.mock(AIHealthAssessmentRepository.class);
        vitalRepository = Mockito.mock(VitalRepository.class);
        restTemplate = Mockito.mock(RestTemplate.class);
        
        aiService = new AIHealthAssessmentService(aiRepository, vitalRepository);
        aiService.setRestTemplate(restTemplate);
    }

    @Test
    void testCalculateBaselineWithInsufficientData() {
        Vital current = new Vital("LKT01", 75.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        List<Vital> history = new ArrayList<>();
        
        Map<String, Object> stats = aiService.calculateBaselineAndAnomaly(current, history);
        
        assertEquals(75.0, stats.get("meanHr"));
        assertEquals(98.0, stats.get("meanSpo2"));
        assertEquals(36.6, stats.get("meanTemp"));
        assertFalse((Boolean) stats.get("anomalyDetected"));
    }

    @Test
    void testCalculateBaselineWithSufficientData() {
        Vital current = new Vital("LKT01", 75.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        
        List<Vital> history = new ArrayList<>();
        history.add(new Vital("LKT01", 70.0, 98.0, 120.0, 80.0, 100.0, 36.5, 16.0));
        history.add(new Vital("LKT01", 72.0, 99.0, 120.0, 80.0, 100.0, 36.6, 16.0));
        history.add(new Vital("LKT01", 74.0, 97.0, 120.0, 80.0, 100.0, 36.7, 16.0));
        
        Map<String, Object> stats = aiService.calculateBaselineAndAnomaly(current, history);
        
        assertEquals(72.0, stats.get("meanHr"));
        assertEquals(98.0, stats.get("meanSpo2"));
        assertEquals(36.6, stats.get("meanTemp"));
    }

    @Test
    void testZScoreAnomalyDetection() {
        Vital current = new Vital("LKT01", 110.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        
        List<Vital> history = new ArrayList<>();
        history.add(new Vital("LKT01", 70.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0));
        history.add(new Vital("LKT01", 71.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0));
        history.add(new Vital("LKT01", 72.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0));
        
        Map<String, Object> stats = aiService.calculateBaselineAndAnomaly(current, history);
        
        assertTrue((Boolean) stats.get("anomalyDetected"));
        assertTrue((Integer) stats.get("anomalyScore") > 50);
    }

    @Test
    void testRiskFusionLOW() {
        Vital current = new Vital("LKT01", 75.0, 98.0, 120.0, 80.0, 100.0, 36.6, 16.0);
        List<Vital> history = new ArrayList<>();
        
        RiskResult ruleRisk = new RiskResult(15, "LOW", Collections.emptyList(), "Normal Vitals");
        
        Map<String, Object> mockResponse = new HashMap<>();
        mockResponse.put("deteriorationProbability", 0.05);
        mockResponse.put("explanation", List.of("Stable"));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class))).thenReturn(mockResponse);

        AIHealthAssessment assessment = aiService.performAssessment(current, history, ruleRisk);
        
        assertEquals("LOW", assessment.getSeverity());
        assertTrue(assessment.getRiskScore() < 30);
    }

    @Test
    void testRiskFusionCRITICAL() {
        Vital current = new Vital("LKT01", 140.0, 82.0, 120.0, 80.0, 100.0, 39.5, 16.0);
        List<Vital> history = new ArrayList<>();
        
        RiskResult ruleRisk = new RiskResult(90, "CRITICAL", List.of("SpO2 critical", "Fever"), "Severe hypoxia");
        
        Map<String, Object> mockResponse = new HashMap<>();
        mockResponse.put("deteriorationProbability", 0.95);
        mockResponse.put("explanation", List.of("SpO2 critical"));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class))).thenReturn(mockResponse);

        AIHealthAssessment assessment = aiService.performAssessment(current, history, ruleRisk);
        
        assertEquals("CRITICAL", assessment.getSeverity());
    }

    @Test
    void testGracefulFallbackWhenPythonOffline() {
        Vital current = new Vital("LKT01", 80.0, 97.0, 120.0, 80.0, 100.0, 36.8, 16.0);
        List<Vital> history = new ArrayList<>();
        
        RiskResult ruleRisk = new RiskResult(30, "MODERATE", List.of("Mild deviation"), "Warning status");
        
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class))).thenThrow(new RuntimeException("Connection refused"));

        AIHealthAssessment assessment = aiService.performAssessment(current, history, ruleRisk);
        
        assertNotNull(assessment);
        assertEquals(0.0, assessment.getDeteriorationProbability());
        assertTrue(assessment.getExplanations().contains("AI service offline"));
    }
}
