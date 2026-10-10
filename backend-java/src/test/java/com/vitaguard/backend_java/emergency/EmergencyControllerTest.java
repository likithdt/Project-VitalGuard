package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class EmergencyControllerTest {

    @Mock
    EmergencyService emergencyService;
    @Mock
    EmergencyRequestRepository emergencyRepository;
    @Mock
    HospitalRepository hospitalRepository;
    @Mock
    DoctorRepository doctorRepository;
    @Mock
    AmbulanceRepository ambulanceRepository;
    @Mock
    UserRepository userRepository;

    EmergencyController emergencyController;

    @BeforeEach
    void setUp() {
        emergencyController = new EmergencyController(
                emergencyService, emergencyRepository, hospitalRepository,
                doctorRepository, ambulanceRepository, userRepository
        );
    }

    @Test
    void testGetEmergencyRequest_PatientOwnEmergency_ReturnsEmergency() {
        // Arrange
        String patientUid = "LKT01";
        User patient = new User(patientUid, "patient@test.com", "pass", "PATIENT");
        patient.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setPatientUid(patientUid);

        setupSecurityContext(patient);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(patientUid)).thenReturn(Optional.of(patient));

        // Act
        ResponseEntity<?> response = emergencyController.getEmergencyRequest(1L);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertInstanceOf(Map.class, response.getBody());
    }

    @Test
    void testGetEmergencyRequest_UnauthorizedDoctor_ReturnsForbidden() {
        // Arrange
        String doctorUid = "DOC_01";
        User doctor = new User(doctorUid, "doc@test.com", "pass", "DOCTOR");
        doctor.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setPatientUid("LKT01");
        request.setDoctorId(2L); // Different doctor

        setupSecurityContext(doctor);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(doctorUid)).thenReturn(Optional.of(doctor));

        // Act
        ResponseEntity<?> response = emergencyController.getEmergencyRequest(1L);

        // Assert
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void testGetEmergencyRequest_AuthorizedDoctor_ReturnsEmergency() {
        // Arrange
        String doctorUid = "DOC_01";
        User doctor = new User(doctorUid, "doc@test.com", "pass", "DOCTOR");
        doctor.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setPatientUid("LKT01");
        request.setDoctorId(1L); // Same doctor

        setupSecurityContext(doctor);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(doctorUid)).thenReturn(Optional.of(doctor));

        // Act
        ResponseEntity<?> response = emergencyController.getEmergencyRequest(1L);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void testGetEmergencyRequest_HospitalAdminWrongHospital_ReturnsForbidden() {
        // Arrange
        String adminUid = "HSP_01";
        User admin = new User(adminUid, "admin@test.com", "pass", "HOSPITAL_ADMIN");
        admin.setId(1L);
        admin.setHospitalId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setPatientUid("LKT01");
        request.setHospitalId(2L); // Different hospital

        setupSecurityContext(admin);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(adminUid)).thenReturn(Optional.of(admin));

        // Act
        ResponseEntity<?> response = emergencyController.getEmergencyRequest(1L);

        // Assert
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void testGetEmergencyRequest_SystemAdmin_ReturnsEmergency() {
        // Arrange
        String adminUid = "SYS_01";
        User admin = new User(adminUid, "sys@test.com", "pass", "SYSTEM_ADMIN");
        admin.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setPatientUid("LKT01");

        setupSecurityContext(admin);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(adminUid)).thenReturn(Optional.of(admin));

        // Act
        ResponseEntity<?> response = emergencyController.getEmergencyRequest(1L);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void testGetActiveEmergencies_Patient_FiltersByPatientUid() {
        // Arrange
        String patientUid = "LKT01";
        User patient = new User(patientUid, "patient@test.com", "pass", "PATIENT");
        patient.setId(1L);

        EmergencyRequest request1 = new EmergencyRequest();
        request1.setId(1L);
        request1.setPatientUid(patientUid);
        request1.setStatus("HOSPITAL_ASSIGNED");

        EmergencyRequest request2 = new EmergencyRequest();
        request2.setId(2L);
        request2.setPatientUid("OTHER");
        request2.setStatus("HOSPITAL_ASSIGNED");

        setupSecurityContext(patient);

        when(emergencyRepository.findByStatusIn(anyList())).thenReturn(List.of(request1, request2));
        when(userRepository.findByUid(patientUid)).thenReturn(Optional.of(patient));

        // Act
        ResponseEntity<?> response = emergencyController.getActiveEmergencies();

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> result = (List<Map<String, Object>>) response.getBody();
        assertEquals(1, result.size());
        assertEquals(patientUid, result.get(0).get("patientUid"));
    }

    @Test
    void testResolveCase_DoctorAuthorized_Succeeds() {
        // Arrange
        String doctorUid = "DOC_01";
        User doctor = new User(doctorUid, "doc@test.com", "pass", "DOCTOR");
        doctor.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setDoctorId(1L);
        request.setHospitalId(1L);

        Hospital hospital = new Hospital();
        hospital.setId(1L);
        hospital.setTotalBeds(100);
        hospital.setAvailableBeds(84);
        hospital.setTotalDoctors(30);
        hospital.setAvailableDoctors(11);

        setupSecurityContext(doctor);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(userRepository.findByUid(doctorUid)).thenReturn(Optional.of(doctor));
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(new Doctor()));
        lenient().when(ambulanceRepository.findById(any())).thenReturn(Optional.empty());

        // Act
        ResponseEntity<?> response = emergencyController.resolveCase(1L);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("RESOLVED", request.getStatus());
        assertEquals(85, hospital.getAvailableBeds());
        assertEquals(12, hospital.getAvailableDoctors());
    }

    @Test
    void testResolveCase_Unauthorized_ReturnsForbidden() {
        // Arrange
        String doctorUid = "DOC_01";
        User doctor = new User(doctorUid, "doc@test.com", "pass", "DOCTOR");
        doctor.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setDoctorId(2L); // Different doctor

        setupSecurityContext(doctor);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(doctorUid)).thenReturn(Optional.of(doctor));

        // Act
        ResponseEntity<?> response = emergencyController.resolveCase(1L);

        // Assert
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void testResolveCase_DuplicateAttempt_ReturnsConflict() {
        // Arrange
        String doctorUid = "DOC_01";
        User doctor = new User(doctorUid, "doc@test.com", "pass", "DOCTOR");
        doctor.setId(1L);

        EmergencyRequest request = new EmergencyRequest();
        request.setId(1L);
        request.setDoctorId(1L);
        request.setStatus("RESOLVED"); // Already resolved

        setupSecurityContext(doctor);

        when(emergencyRepository.findById(1L)).thenReturn(Optional.of(request));
        when(userRepository.findByUid(doctorUid)).thenReturn(Optional.of(doctor));

        // Act
        ResponseEntity<?> response = emergencyController.resolveCase(1L);

        // Assert
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertInstanceOf(Map.class, response.getBody());
        assertEquals("Emergency is already resolved", ((Map<?, ?>) response.getBody()).get("error"));
    }

    private void setupSecurityContext(User user) {
        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn(user.getUid());
        SecurityContext securityContext = mock(SecurityContext.class);
        when(securityContext.getAuthentication()).thenReturn(auth);
        SecurityContextHolder.setContext(securityContext);
    }
}