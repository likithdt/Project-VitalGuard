package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequest;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceService;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRecommendation;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.hospital.HospitalRecommendationService;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.medical.RiskResult;
import com.vitaguard.backend_java.user.FamilyNotificationService;
import com.vitaguard.backend_java.user.PatientFamilyRelationship;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
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
    PatientFamilyRelationshipRepository relationshipRepository;

    EmergencyWorkflowService workflowService;

    @BeforeEach
    void setUp() {
        workflowService = new EmergencyWorkflowService(
                emergencyRepository, eventRepository, hospitalRepository, departmentRepository,
                recommendationService, doctorRepository, ambulanceRepository, ambulanceService,
                userRepository, familyNotificationService, messagingTemplate, medicalProfileRepository
        );
    }

    @Test
    void testInitiateAutomaticEmergency_CreatesEmergencyWithCorrectFlow() {
        // Arrange
        String patientUid = "LKT01";
        RiskResult risk = new RiskResult(85, "CRITICAL", List.of("high_hr"), "High risk detected");

        when(recommendationService.getRecommendations(anyDouble(), anyDouble(), anyString()))
                .thenReturn(List.of());

        // Act
        EmergencyRequest result = workflowService.initiateAutomaticEmergency(
                patientUid, 140.0, 85.0, 39.5, 12.97, 77.59, risk
        );

        // Assert - workflow runs synchronously through all steps
        assertNotNull(result);
        // Since ambulance is required (CRITICAL), the final status will be AMBULANCE_REQUESTED
        // or AMBULANCE_UNAVAILABLE depending on ambulance availability
        assertTrue(result.getRequiresAmbulance());
        assertEquals(85, result.getRiskScore());
        assertEquals("CRITICAL", result.getSeverity());
        
        verify(emergencyRepository, atLeastOnce()).save(any(EmergencyRequest.class));
        verify(eventRepository, atLeastOnce()).save(any());
        verify(ambulanceService).requestNearestAmbulance(any());
    }

    @Test
    void testInitiateAutomaticEmergency_LowRisk_DoesNotRequireAmbulance() {
        // Arrange
        String patientUid = "LKT01";
        RiskResult risk = new RiskResult(30, "LOW", List.of(), "Low risk");

        when(recommendationService.getRecommendations(anyDouble(), anyDouble(), anyString()))
                .thenReturn(List.of());

        // Act
        EmergencyRequest result = workflowService.initiateAutomaticEmergency(
                patientUid, 72.0, 98.0, 36.6, 12.97, 77.59, risk
        );

        // Assert
        assertNotNull(result);
        assertFalse(result.getRequiresAmbulance()); // LOW risk should not require ambulance
        // Since ambulance not required, status should be AMBULANCE_NOT_REQUIRED
        assertEquals("AMBULANCE_NOT_REQUIRED", result.getStatus());
    }

    @Test
    void testInitiateAutomaticEmergency_HospitalAssigned_UpdatesStatus() {
        // Arrange
        String patientUid = "LKT01";
        RiskResult risk = new RiskResult(85, "CRITICAL", List.of("high_hr"), "High risk detected");

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 85, 30, 12, 4.8);
        hospital.setId(1L);
        HospitalRecommendation rec = new HospitalRecommendation(hospital, 5.0, 10.0, 90, "Nearest");

        when(recommendationService.getRecommendations(anyDouble(), anyDouble(), anyString()))
                .thenReturn(List.of(rec));

        // Act
        EmergencyRequest result = workflowService.initiateAutomaticEmergency(
                patientUid, 140.0, 85.0, 39.5, 12.97, 77.59, risk
        );

        // Assert - final status after full workflow
        assertEquals(1L, result.getHospitalId());
        verify(hospitalRepository).save(hospital);
        assertEquals(84, hospital.getAvailableBeds()); // 85 - 1
    }

    @Test
    void testDispatchAmbulance_CallsAmbulanceService() {
        // Arrange
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setRequiresAmbulance(true);

        // Act
        workflowService.dispatchAmbulance(request);

        // Assert
        assertEquals("AMBULANCE_REQUESTED", request.getStatus());
        verify(ambulanceService).requestNearestAmbulance(request);
        verify(emergencyRepository).save(request);
    }

    @Test
    void testResolveEmergency_ReleasesResources() {
        // Arrange
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

        // Act
        workflowService.resolveEmergency(1L);

        // Assert
        assertEquals("RESOLVED", request.getStatus());
        assertNotNull(request.getCompletedAt());
        assertTrue(doctor.getAvailableForEmergency());
        assertEquals("AVAILABLE", ambulance.getStatus());
        assertNull(ambulance.getCurrentEmergencyId());
        assertEquals(85, hospital.getAvailableBeds());
        assertEquals(12, hospital.getAvailableDoctors());

        // Verify timeline event is persisted exactly once
        verify(eventRepository, times(1)).save(argThat(event -> 
                Long.valueOf(1L).equals(event.getEmergencyId()) && "RESOLVED".equals(event.getStatus())));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(eq("/topic/emergency/1"), any(Object.class));
    }

    @Test
    void testResolveEmergency_DuplicateResolution_ThrowsIllegalStateExceptionAndDoesNotDuplicate() {
        // Arrange
        EmergencyRequest request = new EmergencyRequest();
        request.setId(2L);
        request.setStatus("RESOLVED"); // Already resolved

        when(emergencyRepository.findById(2L)).thenReturn(Optional.of(request));

        // Act & Assert
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> workflowService.resolveEmergency(2L));
        assertEquals("Emergency is already resolved", ex.getMessage());

        // Ensure no new event was saved
        verify(eventRepository, never()).save(argThat(event -> Long.valueOf(2L).equals(event.getEmergencyId())));
        // Ensure hospital and doctor were not touched
        verify(hospitalRepository, never()).save(any());
        verify(doctorRepository, never()).save(any());
    }

    @Test
    void testCancelEmergency_ReleasesResources() {
        // Arrange
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

        // Act
        workflowService.cancelEmergency(1L);

        // Assert
        assertEquals("CANCELLED", request.getStatus());
        assertTrue(request.getCancelled());
        assertTrue(doctor.getAvailableForEmergency());
        assertEquals("AVAILABLE", ambulance.getStatus());
        assertNull(ambulance.getCurrentEmergencyId());
    }

    @Test
    void testOnAmbulanceAccepted_UpdatesEmergencyStatus() {
        // Arrange
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setStatus("AMBULANCE_REQUESTED");

        when(emergencyRepository.save(any())).thenReturn(request);

        // Act
        workflowService.onAmbulanceAccepted(request, 1L);

        // Assert
        assertEquals("AMBULANCE_ACCEPTED", request.getStatus());
        assertEquals(1L, request.getAmbulanceId());
        assertTrue(request.getAmbulanceDispatched());
    }

    @Test
    void testOnPatientPickedUp_UpdatesStatus() {
        // Arrange
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setStatus("ARRIVED_AT_PATIENT");

        when(emergencyRepository.save(any())).thenReturn(request);

        // Act
        workflowService.onPatientPickedUp(request);

        // Assert
        assertEquals("PATIENT_PICKED_UP", request.getStatus());
    }

    @Test
    void testOnArrivedAtHospital_UpdatesStatus() {
        // Arrange
        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setStatus("EN_ROUTE_TO_HOSPITAL");

        when(emergencyRepository.save(any())).thenReturn(request);

        // Act
        workflowService.onArrivedAtHospital(request);

        // Assert
        assertEquals("ARRIVED_AT_HOSPITAL", request.getStatus());
    }
}