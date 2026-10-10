package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

class AnomalyDetectionServiceTest {

    private EmergencyRequestRepository emergencyRepository;
    private AnomalyDetectionService anomalyDetectionService;

    @BeforeEach
    void setUp() {
        emergencyRepository = Mockito.mock(EmergencyRequestRepository.class);
        anomalyDetectionService = new AnomalyDetectionService(emergencyRepository);
        anomalyDetectionService.setCooldownMinutes(10); // Configure custom cooldown
    }

    @Test
    void testShouldTriggerWithNoPriorEmergencies() {
        when(emergencyRepository.findByPatientUid("LKT01")).thenReturn(Collections.emptyList());
        
        boolean result = anomalyDetectionService.shouldTriggerEmergency("LKT01");
        assertTrue(result);
    }

    @Test
    void testShouldNotTriggerWithActiveEmergency() {
        List<EmergencyRequest> list = new ArrayList<>();
        EmergencyRequest req = new EmergencyRequest();
        req.setPatientUid("LKT01");
        req.setStatus("HOSPITAL_ASSIGNED");
        req.setCreatedAt(LocalDateTime.now().minusMinutes(2));
        list.add(req);

        when(emergencyRepository.findByPatientUid("LKT01")).thenReturn(list);

        boolean result = anomalyDetectionService.shouldTriggerEmergency("LKT01");
        assertFalse(result);
    }

    @Test
    void testShouldNotTriggerWithinCooldownPeriod() {
        List<EmergencyRequest> list = new ArrayList<>();
        EmergencyRequest req = new EmergencyRequest();
        req.setPatientUid("LKT01");
        req.setStatus("RESOLVED"); // Closed, but within cooldown
        req.setCreatedAt(LocalDateTime.now().minusMinutes(5)); // created 5 mins ago (cooldown is 10)
        list.add(req);

        when(emergencyRepository.findByPatientUid("LKT01")).thenReturn(list);

        boolean result = anomalyDetectionService.shouldTriggerEmergency("LKT01");
        assertFalse(result);
    }

    @Test
    void testShouldTriggerAfterCooldownPeriod() {
        List<EmergencyRequest> list = new ArrayList<>();
        EmergencyRequest req = new EmergencyRequest();
        req.setPatientUid("LKT01");
        req.setStatus("RESOLVED"); // Closed
        req.setCreatedAt(LocalDateTime.now().minusMinutes(15)); // created 15 mins ago (cooldown is 10)
        list.add(req);

        when(emergencyRepository.findByPatientUid("LKT01")).thenReturn(list);

        boolean result = anomalyDetectionService.shouldTriggerEmergency("LKT01");
        assertTrue(result);
    }
}
