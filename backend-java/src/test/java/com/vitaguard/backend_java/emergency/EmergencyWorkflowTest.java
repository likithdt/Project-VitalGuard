package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequest;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceService;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorAssessmentRepository;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalAssignment;
import com.vitaguard.backend_java.hospital.HospitalAssignmentRepository;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRecommendation;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.hospital.HospitalRecommendationService;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.medical.RiskResult;
import com.vitaguard.backend_java.user.FamilyNotificationService;
import com.vitaguard.backend_java.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmergencyWorkflowTest {

    @Mock
    EmergencyRequestRepository emergencyRepository;
    @Mock
    EmergencyEventRepository eventRepository;
    @Mock
    HospitalRepository hospitalRepository;
    @Mock
    HospitalDepartmentRepository departmentRepository;
    @Mock
    HospitalRecommendationService recommendationService;
    @Mock
    DoctorRepository doctorRepository;
    @Mock
    DoctorAssessmentRepository doctorAssessmentRepository;
    @Mock
    AmbulanceRepository ambulanceRepository;
    @Mock
    AmbulanceRequestRepository ambulanceRequestRepository;
    @Mock
    AmbulanceService ambulanceService;
    @Mock
    UserRepository userRepository;
    @Mock
    FamilyNotificationService familyNotificationService;
    @Mock
    SimpMessagingTemplate messagingTemplate;
    @Mock
    MedicalProfileRepository medicalProfileRepository;
    @Mock
    HospitalAssignmentRepository hospitalAssignmentRepository;

    EmergencyWorkflowService workflowService;

    @BeforeEach
    void setUp() {
        workflowService = new EmergencyWorkflowService(
                emergencyRepository, eventRepository, hospitalRepository, departmentRepository,
                recommendationService, doctorRepository, doctorAssessmentRepository, ambulanceRepository, ambulanceService,
                userRepository, familyNotificationService, messagingTemplate, medicalProfileRepository,
                ambulanceRequestRepository, hospitalAssignmentRepository
        );
    }

    // =========================================================================
    // Acceptance Test Scenario 1:
    // Sensor detects emergency and the nearest hospital receives a request
    // =========================================================================
    @Test
    @DisplayName("Scenario 1: Sensor detects emergency, nearest hospital receives request with PENDING_HOSPITAL_ACCEPTANCE")
    void testScenario1_SensorDetectsEmergency_NearestHospitalReceivesRequest() {
        String patientUid = "LKT01";
        RiskResult risk = new RiskResult(88, "CRITICAL", List.of("high_hr"), "High risk arrhythmia detected");

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 85, 30, 12, 4.8);
        hospital.setId(1L);
        when(recommendationService.getRecommendations(anyDouble(), anyDouble(), anyString()))
                .thenReturn(List.of(new HospitalRecommendation(hospital, 2.5, 6.0, 95, "Nearest cardiac unit")));

        EmergencyRequest request = workflowService.initiateAutomaticEmergency(
                patientUid, 150.0, 88.0, 38.0, 12.97, 77.59, risk
        );

        assertNotNull(request);
        assertEquals("PENDING_HOSPITAL_ACCEPTANCE", request.getStatus());
        assertEquals(1L, request.getHospitalId());
        assertNull(request.getDoctorId()); // Doctor NOT assigned yet
        assertNull(request.getRequiresAmbulance()); // Ambulance NOT dispatched automatically

        // Verify hospital assignment persisted
        ArgumentCaptor<HospitalAssignment> assignmentCaptor = ArgumentCaptor.forClass(HospitalAssignment.class);
        verify(hospitalAssignmentRepository, times(1)).save(assignmentCaptor.capture());
        HospitalAssignment savedAssignment = assignmentCaptor.getValue();
        assertEquals(1L, savedAssignment.getHospitalId());
        assertEquals("PENDING", savedAssignment.getStatus());

        // Verify NO ambulance request was sent
        verify(ambulanceService, never()).requestNearestAmbulance(any());
    }

    // =========================================================================
    // Acceptance Test Scenario 2:
    // Hospital accepts, doctor is assigned, and no ambulance is dispatched automatically
    // =========================================================================
    @Test
    @DisplayName("Scenario 2: Hospital accepts -> doctor assigned -> no ambulance dispatched automatically")
    void testScenario2_HospitalAccepts_DoctorAssigned_NoAutoAmbulance() {
        Long emergencyId = 10L;
        Long hospitalId = 1L;

        EmergencyRequest request = new EmergencyRequest();
        request.setId(emergencyId);
        request.setPatientUid("LKT01");
        request.setHospitalId(hospitalId);
        request.setStatus("PENDING_HOSPITAL_ACCEPTANCE");
        request.setRequiredDepartment("Emergency Medicine");

        HospitalAssignment pendingAssignment = new HospitalAssignment(emergencyId, hospitalId);
        pendingAssignment.setStatus("PENDING");

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 85, 30, 12, 4.8);
        hospital.setId(hospitalId);

        Doctor doctor = new Doctor();
        doctor.setId(7L);
        doctor.setName("Aditi Rao");
        doctor.setSpecialization("Emergency Medicine");
        doctor.setDepartmentName("Emergency Medicine");
        doctor.setAvailableForEmergency(true);
        doctor.setOnDuty(true);

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(request));
        when(hospitalAssignmentRepository.findPendingByEmergencyId(emergencyId)).thenReturn(Optional.of(pendingAssignment));
        when(hospitalRepository.findById(hospitalId)).thenReturn(Optional.of(hospital));
        when(doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(eq(hospitalId), anyString(), eq(true), eq(true)))
                .thenReturn(List.of(doctor));

        EmergencyRequest updated = workflowService.acceptHospitalEmergency(emergencyId, hospitalId);

        // Verify status transitioned through HOSPITAL_ACCEPTED to DOCTOR_ASSIGNED
        assertEquals("DOCTOR_ASSIGNED", updated.getStatus());
        assertEquals(7L, updated.getDoctorId());
        assertNotNull(updated.getAcceptedAt());
        assertNull(updated.getRequiresAmbulance()); // Ambulance decision is still pending doctor/staff assessment

        // Verify bed capacity consumed
        assertEquals(84, hospital.getAvailableBeds());
        verify(hospitalRepository, atLeastOnce()).save(hospital);

        // Verify assignment updated to ACCEPTED
        assertEquals("ACCEPTED", pendingAssignment.getStatus());
        assertNotNull(pendingAssignment.getRespondedAt());
        verify(hospitalAssignmentRepository).save(pendingAssignment);

        // Verify doctor marked unavailable
        assertFalse(doctor.getAvailableForEmergency());
        verify(doctorRepository).save(doctor);

        // Verify ambulance service was NEVER triggered
        verify(ambulanceService, never()).requestNearestAmbulance(any());
    }

    // =========================================================================
    // Acceptance Test Scenario 3:
    // Hospital rejects, and the next suitable hospital receives the request
    // =========================================================================
    @Test
    @DisplayName("Scenario 3: Hospital rejects -> re-routed to next suitable hospital -> PENDING_HOSPITAL_ACCEPTANCE")
    void testScenario3_HospitalRejects_NextSuitableHospitalReceivesRequest() {
        Long emergencyId = 15L;
        Long hospital1Id = 1L;
        Long hospital2Id = 2L;

        EmergencyRequest request = new EmergencyRequest();
        request.setId(emergencyId);
        request.setPatientUid("LKT01");
        request.setHospitalId(hospital1Id);
        request.setStatus("PENDING_HOSPITAL_ACCEPTANCE");
        request.setLatitude(12.97);
        request.setLongitude(77.59);
        request.setRequiredDepartment("Emergency Medicine");

        HospitalAssignment assignment1 = new HospitalAssignment(emergencyId, hospital1Id);
        assignment1.setStatus("PENDING");

        Hospital hospital1 = new Hospital("Hospital 1", 12.92, 77.60, 50, 0, 10, 0, 4.0);
        hospital1.setId(hospital1Id);
        Hospital hospital2 = new Hospital("Hospital 2", 12.95, 77.62, 100, 40, 20, 8, 4.5);
        hospital2.setId(hospital2Id);

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(request));
        when(hospitalAssignmentRepository.findPendingByEmergencyId(emergencyId)).thenReturn(Optional.of(assignment1));
        when(hospitalAssignmentRepository.findByEmergencyId(emergencyId)).thenReturn(List.of(assignment1));

        // Recommendations return both hospitals; hospital 1 will be excluded since it rejected
        when(recommendationService.getRecommendations(eq(12.97), eq(77.59), any()))
                .thenReturn(List.of(
                        new HospitalRecommendation(hospital1, 1.0, 3.0, 90, "Nearest"),
                        new HospitalRecommendation(hospital2, 3.0, 8.0, 85, "Second nearest")
                ));

        EmergencyRequest updated = workflowService.rejectHospitalEmergency(emergencyId, hospital1Id, "ICU at maximum capacity");

        // Verify status re-routed to PENDING_HOSPITAL_ACCEPTANCE for Hospital 2
        assertEquals("PENDING_HOSPITAL_ACCEPTANCE", updated.getStatus());
        assertEquals(hospital2Id, updated.getHospitalId());

        // Verify assignment 1 was marked REJECTED
        assertEquals("REJECTED", assignment1.getStatus());
        assertEquals("ICU at maximum capacity", assignment1.getReason());
        verify(hospitalAssignmentRepository).save(assignment1);

        // Verify new assignment created for hospital 2
        ArgumentCaptor<HospitalAssignment> nextAssignCaptor = ArgumentCaptor.forClass(HospitalAssignment.class);
        verify(hospitalAssignmentRepository, atLeast(2)).save(nextAssignCaptor.capture());
        HospitalAssignment nextAssignment = nextAssignCaptor.getAllValues().get(nextAssignCaptor.getAllValues().size() - 1);
        assertEquals(hospital2Id, nextAssignment.getHospitalId());
        assertEquals("PENDING", nextAssignment.getStatus());

        // Verify NO ambulance or driver was notified
        verify(ambulanceService, never()).requestNearestAmbulance(any());
        verify(doctorRepository, never()).save(any());
    }

    // =========================================================================
    // Acceptance Test Scenario 4:
    // Hospital accepts, doctor marks ambulance required, and eligible drivers receive dispatch
    // =========================================================================
    @Test
    @DisplayName("Scenario 4: Doctor marks ambulance required -> AMBULANCE_REQUESTED -> ambulance requested")
    void testScenario4_DoctorMarksAmbulanceRequired_EligibleDriversReceiveDispatch() {
        Long emergencyId = 20L;
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(emergencyId);
        emergency.setHospitalId(1L);
        emergency.setDoctorId(5L);
        emergency.setStatus("DOCTOR_ASSIGNED");

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(emergency));

        // Doctor decides ambulance is REQUIRED
        EmergencyRequest updated = workflowService.setAmbulanceDecision(emergencyId, true);

        assertEquals("AMBULANCE_REQUESTED", updated.getStatus());
        assertTrue(updated.getRequiresAmbulance());
        assertEquals("REQUIRED", updated.getAmbulanceDecision());

        // Verify ambulance service was called to dispatch to nearest ambulance
        verify(ambulanceService, times(1)).requestNearestAmbulance(emergency);
        verify(emergencyRepository).save(emergency);
    }

    // =========================================================================
    // Doctor marks ambulance NOT required
    // =========================================================================
    @Test
    @DisplayName("Ambulance not required: Continuous monitoring continues without dispatch")
    void testAmbulanceNotRequired_ContinuousMonitoringWithoutDispatch() {
        Long emergencyId = 25L;
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(emergencyId);
        emergency.setHospitalId(1L);
        emergency.setDoctorId(5L);
        emergency.setStatus("DOCTOR_ASSIGNED");

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(emergency));

        EmergencyRequest updated = workflowService.setAmbulanceDecision(emergencyId, false);

        assertEquals("AMBULANCE_NOT_REQUIRED", updated.getStatus());
        assertFalse(updated.getRequiresAmbulance());
        assertEquals("NOT_REQUIRED", updated.getAmbulanceDecision());

        verify(ambulanceService, never()).requestNearestAmbulance(any());
    }

    // =========================================================================
    // Acceptance Test Scenario 5:
    // Driver accepts, and live tracking begins when the journey starts
    // =========================================================================
    @Test
    @DisplayName("Scenario 5: Driver accepts -> AMBULANCE_ACCEPTED -> Journey starts -> live tracking active")
    void testScenario5_DriverAccepts_LiveTrackingBeginsWhenJourneyStarts() {
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(30L);
        emergency.setStatus("AMBULANCE_REQUESTED");
        emergency.setRequiresAmbulance(true);

        when(emergencyRepository.save(any())).thenReturn(emergency);

        // 1. Driver accepts request
        workflowService.onAmbulanceAccepted(emergency, 42L);
        assertEquals("AMBULANCE_ACCEPTED", emergency.getStatus());
        assertEquals(42L, emergency.getAmbulanceId());
        assertTrue(emergency.getAmbulanceDispatched());

        // 2. Driver starts journey
        workflowService.onAmbulanceEnRoute(emergency);
        assertEquals("AMBULANCE_DISPATCHED", emergency.getStatus());

        // 3. Subsequent journey tracking stages
        workflowService.onArrivedAtPatient(emergency);
        assertEquals("ARRIVED_AT_PATIENT", emergency.getStatus());

        workflowService.onPatientPickedUp(emergency);
        assertEquals("PATIENT_PICKED_UP", emergency.getStatus());

        workflowService.onEnRouteToHospital(emergency);
        assertEquals("EN_ROUTE_TO_HOSPITAL", emergency.getStatus());

        workflowService.onArrivedAtHospital(emergency);
        assertEquals("ARRIVED_AT_HOSPITAL", emergency.getStatus());
    }

    // =========================================================================
    // Acceptance Test Scenario 6:
    // Two hospitals or drivers attempt duplicate acceptance; only one valid assignment succeeds
    // =========================================================================
    @Test
    @DisplayName("Scenario 6: Duplicate hospital acceptance throws IllegalStateException")
    void testScenario6_DuplicateHospitalAcceptance_ThrowsIllegalStateException() {
        Long emergencyId = 40L;
        Long hospital1Id = 1L;

        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(emergencyId);
        emergency.setHospitalId(hospital1Id);
        emergency.setStatus("HOSPITAL_ACCEPTED"); // Already accepted

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(emergency));

        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                workflowService.acceptHospitalEmergency(emergencyId, hospital1Id)
        );
        assertTrue(ex.getMessage().contains("no longer pending acceptance"));
    }

    @Test
    @DisplayName("Scenario 6b: Wrong hospital cannot accept another hospital's assignment")
    void testScenario6b_WrongHospitalCannotAccept() {
        Long emergencyId = 41L;
        Long assignedHospitalId = 1L;
        Long imposterHospitalId = 2L;

        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(emergencyId);
        emergency.setHospitalId(assignedHospitalId);
        emergency.setStatus("PENDING_HOSPITAL_ACCEPTANCE");

        when(emergencyRepository.findById(emergencyId)).thenReturn(Optional.of(emergency));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                workflowService.acceptHospitalEmergency(emergencyId, imposterHospitalId)
        );
        assertTrue(ex.getMessage().contains("not assigned to this hospital"));
    }

    // =========================================================================
    // Acceptance Test Scenario 7:
    // Guardian, hospital, doctor, and driver dashboards receive correct real-time status updates
    // =========================================================================
    @Test
    @DisplayName("Scenario 7: Real-time status updates broadcasted via WebSockets to topics")
    void testScenario7_DashboardsReceiveRealtimeStatusUpdates() {
        EmergencyRequest request = new EmergencyRequest();
        request.setId(50L);
        request.setPatientUid("LKT01");
        request.setHospitalId(1L);
        request.setStatus("PENDING_HOSPITAL_ACCEPTANCE"); // Must be pending for acceptance
        request.setAmbulanceDecision("REQUIRED");
        request.setRequiredDepartment("Emergency Medicine");

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 85, 30, 12, 4.8);
        hospital.setId(1L);
        
        HospitalAssignment assignment = new HospitalAssignment(50L, 1L);
        assignment.setStatus("PENDING");

        Doctor doctor = new Doctor();
        doctor.setId(5L);
        doctor.setName("Dr. Test");
        doctor.setDepartmentName("Emergency Medicine");
        doctor.setAvailableForEmergency(true);
        doctor.setOnDuty(true);

        when(emergencyRepository.findById(50L)).thenReturn(Optional.of(request));
        when(hospitalAssignmentRepository.findPendingByEmergencyId(50L)).thenReturn(Optional.of(assignment));
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(eq(1L), anyString(), eq(true), eq(true)))
                .thenReturn(List.of(doctor));
        when(emergencyRepository.save(any())).thenReturn(request);
        when(hospitalAssignmentRepository.save(any())).thenReturn(assignment);
        when(doctorRepository.save(any())).thenReturn(doctor);

        // Call acceptHospitalEmergency which internally calls broadcastWorkflowUpdate
        workflowService.acceptHospitalEmergency(50L, 1L);

        // Verify WebSocket broadcasts to the actual channels used
        // Note: broadcastWorkflowUpdate is called twice - once for HOSPITAL_ACCEPTED, once for DOCTOR_ASSIGNED
        // Verify emergency-specific topic
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/emergency/50"), any(Object.class));
        // Verify hospital assignments topic
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/hospital/assignments"), any(Object.class));
        // Verify family notifications topic
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/family-notifications/LKT01"), any(Object.class));
        // Verify hospital-specific emergencies topic
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/hospital/1/emergencies"), any(Object.class));
    }

    // =========================================================================
    // Helper & Edge-case Tests
    // =========================================================================
    @Test
    @DisplayName("Missing GPS coordinates defaults safely to Bengaluru center")
    void testGracefulErrorHandling_MissingGps_FallsBackSafely() {
        String patientUid = "LKT01";
        RiskResult risk = new RiskResult(80, "CRITICAL", List.of("hypoxia"), "Hypoxia detected");

        when(recommendationService.getRecommendations(anyDouble(), anyDouble(), anyString()))
                .thenReturn(List.of());

        EmergencyRequest result = workflowService.initiateAutomaticEmergency(
                patientUid, 120.0, 88.0, 37.0, null, null, risk
        );

        assertNotNull(result);
        assertEquals(12.9716, result.getLatitude());
        assertEquals(77.5946, result.getLongitude());
        assertEquals("SEARCHING_HOSPITAL", result.getStatus());
    }

    @Test
    @DisplayName("Resolve emergency frees hospital beds, doctors, and ambulances")
    void testResolveEmergency_ReleasesResources() {
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setHospitalId(1L);
        request.setDoctorId(1L);
        request.setAmbulanceId(1L);
        request.setStatus("ARRIVED_AT_HOSPITAL");

        Hospital hospital = new Hospital("Apollo", 12.92, 77.60, 100, 84, 30, 11, 4.8);
        hospital.setId(1L);
        hospital.setTotalBeds(100);
        hospital.setTotalDoctors(30);

        Doctor doctor = new Doctor();
        doctor.setId(1L);
        doctor.setAvailableForEmergency(false);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setStatus("EN_ROUTE_TO_HOSPITAL");
        ambulance.setCurrentEmergencyId(1L);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));

        workflowService.resolveEmergency(1L);

        assertEquals("RESOLVED", request.getStatus());
        assertNotNull(request.getCompletedAt());
        assertTrue(doctor.getAvailableForEmergency());
        assertEquals("AVAILABLE", ambulance.getStatus());
        assertNull(ambulance.getCurrentEmergencyId());
        assertEquals(85, hospital.getAvailableBeds());
        assertEquals(12, hospital.getAvailableDoctors());

        verify(eventRepository, times(1)).save(argThat(event ->
                Long.valueOf(1L).equals(event.getEmergencyId()) && "RESOLVED".equals(event.getStatus())));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/emergency/1"), any(Object.class));
    }

    @Test
    @DisplayName("Duplicate resolution throws IllegalStateException")
    void testResolveEmergency_DuplicateResolution_ThrowsIllegalStateException() {
        EmergencyRequest request = new EmergencyRequest();
        request.setId(2L);
        request.setStatus("RESOLVED");

        when(emergencyRepository.findById(2L)).thenReturn(Optional.of(request));

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> workflowService.resolveEmergency(2L));
        assertEquals("Emergency is already resolved", ex.getMessage());

        verify(eventRepository, never()).save(argThat(event -> Long.valueOf(2L).equals(event.getEmergencyId())));
        verify(hospitalRepository, never()).save(any());
        verify(doctorRepository, never()).save(any());
    }

    @Test
    @DisplayName("Cancel emergency releases resources")
    void testCancelEmergency_ReleasesResources() {
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setHospitalId(1L);
        request.setDoctorId(1L);
        request.setAmbulanceId(1L);

        Hospital hospital = new Hospital("Apollo", 12.92, 77.60, 100, 84, 30, 11, 4.8);
        hospital.setId(1L);
        hospital.setTotalBeds(100);
        hospital.setTotalDoctors(30);

        Doctor doctor = new Doctor();
        doctor.setId(1L);
        doctor.setAvailableForEmergency(false);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setStatus("ACCEPTED");
        ambulance.setCurrentEmergencyId(1L);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));

        workflowService.cancelEmergency(1L);

        assertEquals("CANCELLED", request.getStatus());
        assertTrue(request.getCancelled());
        assertTrue(doctor.getAvailableForEmergency());
        assertEquals("AVAILABLE", ambulance.getStatus());
        assertNull(ambulance.getCurrentEmergencyId());
    }
}
