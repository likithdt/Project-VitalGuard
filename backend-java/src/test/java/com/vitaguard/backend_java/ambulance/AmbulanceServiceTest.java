package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
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
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AmbulanceServiceTest {

    @Mock
    AmbulanceRepository ambulanceRepository;
    @Mock
    AmbulanceRequestRepository requestRepository;
    @Mock
    EmergencyRequestRepository emergencyRepository;
    @Mock
    HospitalRepository hospitalRepository;
    @Mock
    UserRepository userRepository;
    @Mock
    SimpMessagingTemplate messagingTemplate;
    @Mock
    EmergencyWorkflowService emergencyWorkflowService;

    AmbulanceService ambulanceService;

    @BeforeEach
    void setUp() {
        ambulanceService = new AmbulanceService(
                ambulanceRepository, requestRepository, emergencyRepository,
                hospitalRepository, userRepository, messagingTemplate, emergencyWorkflowService
        );
    }

    @Test
    void testRequestNearestAmbulance_NoAmbulancesAvailable_ReturnsNull() {
        // Arrange
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);
        emergency.setRequiresAmbulance(true);
        emergency.setLatitude(12.97);
        emergency.setLongitude(77.59);

        when(ambulanceRepository.findByStatus("AVAILABLE")).thenReturn(List.of());

        // Act
        AmbulanceRequest result = ambulanceService.requestNearestAmbulance(emergency);

        // Assert
        assertNull(result);
        assertEquals("AMBULANCE_UNAVAILABLE", emergency.getStatus());
        verify(emergencyRepository).save(emergency);
    }

    @Test
    void testRequestNearestAmbulance_RequiresAmbulanceFalse_ReturnsNull() {
        // Arrange
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);
        emergency.setRequiresAmbulance(false);

        // Act
        AmbulanceRequest result = ambulanceService.requestNearestAmbulance(emergency);

        // Assert
        assertNull(result);
        verify(ambulanceRepository, never()).findByStatus(anyString());
    }

    @Test
    void testRequestNearestAmbulance_AssignsNearestAmbulance() {
        // Arrange
        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);
        emergency.setRequiresAmbulance(true);
        emergency.setLatitude(12.97);
        emergency.setLongitude(77.59);

        Ambulance amb1 = new Ambulance("AMB-01", "Apollo", 12.92, 77.60); // ~5.6 km
        amb1.setId(1L);
        amb1.setStatus("AVAILABLE");
        amb1.setDriver(new User());

        Ambulance amb2 = new Ambulance("AMB-02", "Fortis", 12.96, 77.64); // ~4.5 km - closer
        amb2.setId(2L);
        amb2.setStatus("AVAILABLE");
        amb2.setDriver(new User());

        when(ambulanceRepository.findByStatus("AVAILABLE")).thenReturn(List.of(amb1, amb2));
        when(requestRepository.existsByEmergencyIdAndStatusIn(anyLong(), anyList())).thenReturn(false);
        when(requestRepository.findByAmbulanceIdAndStatusIn(anyLong(), anyList())).thenReturn(List.of());
        when(emergencyRepository.save(any())).thenReturn(emergency);
        when(ambulanceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Act
        AmbulanceRequest result = ambulanceService.requestNearestAmbulance(emergency);

        // Assert
        assertNotNull(result);
        assertEquals(2L, result.getAmbulanceId()); // amb2 is closer
        assertEquals("PENDING", result.getStatus());
        assertEquals("REQUESTED", amb2.getStatus());
        assertEquals(1L, amb2.getCurrentEmergencyId());
        verify(emergencyRepository).save(emergency);
        assertEquals("AMBULANCE_REQUESTED", emergency.getStatus());
    }

    @Test
    void testAcceptRequest_Success() {
        // Arrange
        Long requestId = 1L;
        Long driverId = 1L;

        User driver = new User();
        driver.setId(driverId);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setStatus("REQUESTED");
        ambulance.setCurrentEmergencyId(1L);
        ambulance.setDriver(driver);

        AmbulanceRequest request = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request.setId(requestId);
        request.setStatus("PENDING");

        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);
        emergency.setStatus("AMBULANCE_REQUESTED");

        when(requestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));
        when(requestRepository.findByEmergencyIdAndStatusIn(1L, List.of("ACCEPTED"))).thenReturn(List.of());
        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(emergency));
        when(requestRepository.save(any())).thenReturn(request);
        when(ambulanceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(emergencyRepository.save(any())).thenReturn(emergency);

        // Act
        boolean result = ambulanceService.acceptRequest(requestId, driverId);

        // Assert
        assertTrue(result);
        assertEquals("ACCEPTED", request.getStatus());
        assertEquals("ACCEPTED", ambulance.getStatus());
        assertEquals(1L, emergency.getAmbulanceId());
        assertTrue(emergency.getAmbulanceDispatched());
        verify(emergencyWorkflowService).onAmbulanceAccepted(emergency, 1L);
    }

    @Test
    void testAcceptRequest_AlreadyAccepted_ReturnsFalse() {
        // Arrange
        Long requestId = 1L;
        Long driverId = 1L;

        AmbulanceRequest request = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request.setId(requestId);
        request.setStatus("ACCEPTED"); // Already accepted

        when(requestRepository.findById(requestId)).thenReturn(Optional.of(request));

        // Act
        boolean result = ambulanceService.acceptRequest(requestId, driverId);

        // Assert
        assertFalse(result);
    }

    @Test
    void testAcceptRequest_WrongDriver_ReturnsFalse() {
        // Arrange
        Long requestId = 1L;
        Long driverId = 1L;
        Long otherDriverId = 2L;

        User otherDriver = new User();
        otherDriver.setId(otherDriverId);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setDriver(otherDriver);

        AmbulanceRequest request = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request.setId(requestId);
        request.setStatus("PENDING");

        when(requestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));

        // Act
        boolean result = ambulanceService.acceptRequest(requestId, driverId);

        // Assert
        assertFalse(result);
    }

    @Test
    void testAcceptRequest_AnotherAmbulanceAlreadyAccepted_DeclinesThisRequest() {
        // Arrange
        Long requestId = 1L;
        Long driverId = 1L;

        User driver = new User();
        driver.setId(driverId);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setDriver(driver);

        AmbulanceRequest request = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request.setId(requestId);
        request.setStatus("PENDING");

        // Another request already accepted for same emergency
        AmbulanceRequest otherRequest = new AmbulanceRequest(1L, 2L, 3.0, 8);
        otherRequest.setId(2L);
        otherRequest.setStatus("ACCEPTED");

        when(requestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));
        when(requestRepository.findByEmergencyIdAndStatusIn(1L, List.of("ACCEPTED"))).thenReturn(List.of(otherRequest));
        when(requestRepository.save(any())).thenReturn(request);

        // Act
        boolean result = ambulanceService.acceptRequest(requestId, driverId);

        // Assert
        assertFalse(result);
        assertEquals("DECLINED", request.getStatus());
    }

    @Test
    void testDeclineRequest_Success_RequestsNextAmbulance() {
        // Arrange
        Long requestId = 1L;
        Long driverId = 1L;

        User driver = new User();
        driver.setId(driverId);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setStatus("REQUESTED");
        ambulance.setCurrentEmergencyId(1L);
        ambulance.setDriver(driver);

        AmbulanceRequest request = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request.setId(requestId);
        request.setStatus("PENDING");

        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);
        emergency.setStatus("AMBULANCE_REQUESTED");
        emergency.setRequiresAmbulance(true);

        when(requestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));
        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(emergency));
        when(requestRepository.save(any())).thenReturn(request);
        when(ambulanceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(ambulanceRepository.findByStatus("AVAILABLE")).thenReturn(List.of()); // No more ambulances

        // Act
        boolean result = ambulanceService.declineRequest(requestId, driverId);

        // Assert
        assertTrue(result);
        assertEquals("DECLINED", request.getStatus());
        assertEquals("AVAILABLE", ambulance.getStatus());
        assertNull(ambulance.getCurrentEmergencyId());
        assertEquals("AMBULANCE_UNAVAILABLE", emergency.getStatus());
    }

    @Test
    void testUpdateAmbulanceStatus_UpdatesLocationAndBroadcasts() {
        // Arrange
        Long ambulanceId = 1L;
        String status = "EN_ROUTE_TO_PATIENT";
        Double lat = 12.95;
        Double lng = 77.60;

        Ambulance ambulance = new Ambulance();
        ambulance.setId(ambulanceId);
        ambulance.setCurrentEmergencyId(1L);

        EmergencyRequest emergency = new EmergencyRequest();
        emergency.setId(1L);

        when(ambulanceRepository.findById(ambulanceId)).thenReturn(Optional.of(ambulance));
        when(ambulanceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(emergency));

        // Act
        ambulanceService.updateAmbulanceStatus(ambulanceId, status, lat, lng);

        // Assert
        assertEquals(status, ambulance.getStatus());
        assertEquals(lat, ambulance.getLatitude());
        assertEquals(lng, ambulance.getLongitude());
        verify(messagingTemplate).convertAndSend(eq("/topic/ambulance/" + ambulanceId), (Object) anyMap());
        verify(messagingTemplate).convertAndSend(eq("/topic/emergency/" + 1L), (Object) anyMap());
        verify(emergencyWorkflowService).onAmbulanceEnRoute(emergency);
    }

    @Test
    void testGetPendingRequests_ReturnsRequestsForDriver() {
        // Arrange
        Long driverId = 1L;

        User driver = new User();
        driver.setId(driverId);

        Ambulance ambulance = new Ambulance();
        ambulance.setId(1L);
        ambulance.setDriver(driver);

        AmbulanceRequest request1 = new AmbulanceRequest(1L, 1L, 5.0, 10);
        request1.setStatus("PENDING");
        AmbulanceRequest request2 = new AmbulanceRequest(2L, 1L, 3.0, 8);
        request2.setStatus("PENDING");

        when(ambulanceRepository.findByDriverId(driverId)).thenReturn(Optional.of(ambulance));
        when(requestRepository.findByAmbulanceIdAndStatusIn(1L, List.of("PENDING"))).thenReturn(List.of(request1, request2));

        // Act
        List<AmbulanceRequest> result = ambulanceService.getPendingRequests(driverId);

        // Assert
        assertEquals(2, result.size());
    }
}