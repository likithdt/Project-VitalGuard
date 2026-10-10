package com.vitaguard.backend_java.admin;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceController;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceService;
import com.vitaguard.backend_java.auth.AuthResponse;
import com.vitaguard.backend_java.auth.AuthService;
import com.vitaguard.backend_java.auth.LoginRequest;
import com.vitaguard.backend_java.auth.RegisterRequest;
import com.vitaguard.backend_java.config.DatabaseSeeder;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorController;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalController;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminSecurityTest {

    @Mock
    UserRepository userRepository;
    @Mock
    DoctorRepository doctorRepository;
    @Mock
    HospitalRepository hospitalRepository;
    @Mock
    HospitalDepartmentRepository departmentRepository;
    @Mock
    AmbulanceRepository ambulanceRepository;
    @Mock
    EmergencyRequestRepository emergencyRepository;
    @Mock
    PasswordEncoder passwordEncoder;
    @Mock
    JwtService jwtService;
    @Mock
    AuthenticationManager authenticationManager;
    @Mock
    AmbulanceService ambulanceService;
    @Mock
    AmbulanceRequestRepository ambulanceRequestRepository;
    @Mock
    PatientFamilyRelationshipRepository relationshipRepository;

    AuthService authService;
    AdminController adminController;
    HospitalController hospitalController;
    DoctorController doctorController;
    AmbulanceController ambulanceController;
    DatabaseSeeder databaseSeeder;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, jwtService, authenticationManager);
        adminController = new AdminController(
                userRepository, doctorRepository, hospitalRepository,
                departmentRepository, ambulanceRepository, emergencyRepository, passwordEncoder
        );
        hospitalController = new HospitalController(
                hospitalRepository, departmentRepository, doctorRepository,
                emergencyRepository, userRepository, ambulanceRepository
        );
        doctorController = new DoctorController(
                doctorRepository, emergencyRepository, userRepository,
                hospitalRepository, ambulanceRepository
        );
        ambulanceController = new AmbulanceController(
                ambulanceService, ambulanceRepository, ambulanceRequestRepository,
                emergencyRepository, userRepository
        );
        databaseSeeder = new DatabaseSeeder(
                hospitalRepository, departmentRepository, doctorRepository,
                ambulanceRepository, userRepository, relationshipRepository, passwordEncoder
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void mockSecurityContext(String uid) {
        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn(uid);
        SecurityContext context = mock(SecurityContext.class);
        when(context.getAuthentication()).thenReturn(auth);
        SecurityContextHolder.setContext(context);
    }

    // ==========================================
    // 1. System Admin can login
    // ==========================================
    @Test
    @DisplayName("1. System Admin can login")
    void test1_SystemAdminCanLogin() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "encodedPass", "SYSTEM_ADMIN");
        sysAdmin.setStatus("ACTIVE");

        when(userRepository.findByEmail("sysadmin@vitaguard.com")).thenReturn(Optional.of(sysAdmin));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(sysAdmin)).thenReturn("mockJwtToken");

        LoginRequest req = new LoginRequest();
        req.setEmail("sysadmin@vitaguard.com");
        req.setPassword("password");

        AuthResponse res = authService.login(req);
        assertNotNull(res);
        assertEquals("SYSTEM_ADMIN", res.getRole());
        assertEquals("SYS_01", res.getUid());
    }

    // ==========================================
    // 2. System Admin can register Doctor
    // ==========================================
    @Test
    @DisplayName("2. System Admin can register Doctor")
    void test2_SystemAdminCanRegisterDoctor() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 80, 20, 15, 4.8);
        hospital.setId(1L);
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(userRepository.existsByEmail("dr.sharma@apollo.com")).thenReturn(false);
        when(passwordEncoder.encode(any())).thenReturn("encodedPass");

        Map<String, Object> body = Map.of(
                "name", "Dr. Rajesh Sharma",
                "email", "dr.sharma@apollo.com",
                "phone", "9876543210",
                "specialization", "Cardiology",
                "hospitalId", 1L
        );

        ResponseEntity<?> response = adminController.registerDoctor(body);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        verify(doctorRepository).save(any(Doctor.class));
        verify(userRepository).save(any(User.class));
    }

    // ==========================================
    // 3. Registered Doctor can login
    // ==========================================
    @Test
    @DisplayName("3. Registered Doctor can login")
    void test3_RegisteredDoctorCanLogin() {
        User doctorUser = new User("DOC_01", "doctor@vitaguard.com", "encodedPass", "DOCTOR");
        doctorUser.setStatus("ACTIVE");

        when(userRepository.findByEmail("doctor@vitaguard.com")).thenReturn(Optional.of(doctorUser));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(doctorUser)).thenReturn("mockJwtToken");

        LoginRequest req = new LoginRequest();
        req.setEmail("doctor@vitaguard.com");
        req.setPassword("password");

        AuthResponse res = authService.login(req);
        assertNotNull(res);
        assertEquals("DOCTOR", res.getRole());
    }

    // ==========================================
    // 4. Unregistered Doctor cannot login
    // ==========================================
    @Test
    @DisplayName("4. Unregistered Doctor cannot login")
    void test4_UnregisteredDoctorCannotLogin() {
        when(userRepository.findByEmail("unregistered.doc@hospital.com")).thenReturn(Optional.empty());

        LoginRequest req = new LoginRequest();
        req.setEmail("unregistered.doc@hospital.com");
        req.setPassword("password");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(req));
        assertTrue(ex.getMessage().contains("Your account has not been registered by the system administrator."));
    }

    // ==========================================
    // 5. System Admin can register Hospital Admin
    // ==========================================
    @Test
    @DisplayName("5. System Admin can register Hospital Admin")
    void test5_SystemAdminCanRegisterHospitalAdmin() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 80, 20, 15, 4.8);
        hospital.setId(1L);
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(userRepository.existsByEmail("admin@apollo.com")).thenReturn(false);
        when(passwordEncoder.encode(any())).thenReturn("encodedPass");

        Map<String, Object> body = Map.of(
                "name", "Hospital Admin Apollo",
                "email", "admin@apollo.com",
                "phone", "9876543211",
                "hospitalId", 1L
        );

        ResponseEntity<?> response = adminController.registerHospitalAdmin(body);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        verify(userRepository).save(any(User.class));
    }

    // ==========================================
    // 6. Registered Hospital Admin can login
    // ==========================================
    @Test
    @DisplayName("6. Registered Hospital Admin can login")
    void test6_RegisteredHospitalAdminCanLogin() {
        User hospitalAdmin = new User("HSP_01", "hospital-admin@vitalguard.com", "encodedPass", "HOSPITAL_ADMIN");
        hospitalAdmin.setStatus("ACTIVE");

        when(userRepository.findByEmail("hospital-admin@vitalguard.com")).thenReturn(Optional.of(hospitalAdmin));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(hospitalAdmin)).thenReturn("mockJwtToken");

        LoginRequest req = new LoginRequest();
        req.setEmail("hospital-admin@vitalguard.com");
        req.setPassword("password");

        AuthResponse res = authService.login(req);
        assertNotNull(res);
        assertEquals("HOSPITAL_ADMIN", res.getRole());
    }

    // ==========================================
    // 7. Unregistered Hospital Admin cannot login
    // ==========================================
    @Test
    @DisplayName("7. Unregistered Hospital Admin cannot login")
    void test7_UnregisteredHospitalAdminCannotLogin() {
        when(userRepository.findByEmail("unregistered.hsp@hospital.com")).thenReturn(Optional.empty());

        LoginRequest req = new LoginRequest();
        req.setEmail("unregistered.hsp@hospital.com");
        req.setPassword("password");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(req));
        assertTrue(ex.getMessage().contains("Your account has not been registered by the system administrator."));
    }

    // ==========================================
    // 8. System Admin can register Ambulance Driver
    // ==========================================
    @Test
    @DisplayName("8. System Admin can register Ambulance Driver")
    void test8_SystemAdminCanRegisterAmbulanceDriver() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Ambulance ambulance = new Ambulance("AMB-01", "Apollo Hospital", 12.92, 77.60);
        ambulance.setId(1L);
        when(ambulanceRepository.findById(1L)).thenReturn(Optional.of(ambulance));
        when(userRepository.existsByEmail("driver@apollo.com")).thenReturn(false);
        when(passwordEncoder.encode(any())).thenReturn("encodedPass");

        Map<String, Object> body = Map.of(
                "name", "Driver John",
                "email", "driver@apollo.com",
                "phone", "9876543212",
                "ambulanceId", 1L
        );

        ResponseEntity<?> response = adminController.registerDriver(body);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        verify(userRepository).save(any(User.class));
        verify(ambulanceRepository).save(ambulance);
    }

    // ==========================================
    // 9. Registered Driver can login
    // ==========================================
    @Test
    @DisplayName("9. Registered Driver can login")
    void test9_RegisteredDriverCanLogin() {
        User driver = new User("AMB_01", "ambulance-driver@vitalguard.com", "encodedPass", "AMBULANCE_DRIVER");
        driver.setStatus("ACTIVE");

        when(userRepository.findByEmail("ambulance-driver@vitalguard.com")).thenReturn(Optional.of(driver));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(driver)).thenReturn("mockJwtToken");

        LoginRequest req = new LoginRequest();
        req.setEmail("ambulance-driver@vitalguard.com");
        req.setPassword("password");

        AuthResponse res = authService.login(req);
        assertNotNull(res);
        assertEquals("AMBULANCE_DRIVER", res.getRole());
    }

    // ==========================================
    // 10. Unregistered Driver cannot login
    // ==========================================
    @Test
    @DisplayName("10. Unregistered Driver cannot login")
    void test10_UnregisteredDriverCannotLogin() {
        when(userRepository.findByEmail("unregistered.driver@vitalguard.com")).thenReturn(Optional.empty());

        LoginRequest req = new LoginRequest();
        req.setEmail("unregistered.driver@vitalguard.com");
        req.setPassword("password");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(req));
        assertTrue(ex.getMessage().contains("Your account has not been registered by the system administrator."));
    }

    // ==========================================
    // 11. Patient signup cannot create DOCTOR
    // ==========================================
    @Test
    @DisplayName("11. Patient signup cannot create DOCTOR")
    void test11_PatientSignupCannotCreateDoctor() {
        RegisterRequest req = new RegisterRequest();
        req.setEmail("attacker.doc@test.com");
        req.setPassword("password");
        req.setRole("DOCTOR");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.register(req));
        assertTrue(ex.getMessage().contains("Privileged roles"));
    }

    // ==========================================
    // 12. Patient signup cannot create HOSPITAL_ADMIN
    // ==========================================
    @Test
    @DisplayName("12. Patient signup cannot create HOSPITAL_ADMIN")
    void test12_PatientSignupCannotCreateHospitalAdmin() {
        RegisterRequest req = new RegisterRequest();
        req.setEmail("attacker.admin@test.com");
        req.setPassword("password");
        req.setRole("HOSPITAL_ADMIN");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.register(req));
        assertTrue(ex.getMessage().contains("Privileged roles"));
    }

    // ==========================================
    // 13. Patient signup cannot create AMBULANCE_DRIVER
    // ==========================================
    @Test
    @DisplayName("13. Patient signup cannot create AMBULANCE_DRIVER")
    void test13_PatientSignupCannotCreateAmbulanceDriver() {
        RegisterRequest req = new RegisterRequest();
        req.setEmail("attacker.driver@test.com");
        req.setPassword("password");
        req.setRole("AMBULANCE_DRIVER");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.register(req));
        assertTrue(ex.getMessage().contains("Privileged roles"));
    }

    // ==========================================
    // 14. Patient signup cannot create SYSTEM_ADMIN
    // ==========================================
    @Test
    @DisplayName("14. Patient signup cannot create SYSTEM_ADMIN")
    void test14_PatientSignupCannotCreateSystemAdmin() {
        RegisterRequest req = new RegisterRequest();
        req.setEmail("attacker.sysadmin@test.com");
        req.setPassword("password");
        req.setRole("SYSTEM_ADMIN");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.register(req));
        assertTrue(ex.getMessage().contains("Privileged roles"));
    }

    // ==========================================
    // 15. Normal user cannot access admin APIs
    // ==========================================
    @Test
    @DisplayName("15. Normal user cannot access admin APIs")
    void test15_NormalUserCannotAccessAdminApis() {
        User patient = new User("PAT_01", "patient@vitaguard.com", "pass", "PATIENT");
        mockSecurityContext("PAT_01");
        when(userRepository.findByUid("PAT_01")).thenReturn(Optional.of(patient));

        ResponseEntity<?> response = adminController.getStats();
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // ==========================================
    // 16. Doctor cannot access admin APIs
    // ==========================================
    @Test
    @DisplayName("16. Doctor cannot access admin APIs")
    void test16_DoctorCannotAccessAdminApis() {
        User doctor = new User("DOC_01", "doctor@vitaguard.com", "pass", "DOCTOR");
        mockSecurityContext("DOC_01");
        when(userRepository.findByUid("DOC_01")).thenReturn(Optional.of(doctor));

        ResponseEntity<?> response = adminController.listDoctors();
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // ==========================================
    // 17. Hospital Admin cannot access admin APIs
    // ==========================================
    @Test
    @DisplayName("17. Hospital Admin cannot access admin APIs")
    void test17_HospitalAdminCannotAccessAdminApis() {
        User hospitalAdmin = new User("HSP_01", "admin@hospital.com", "pass", "HOSPITAL_ADMIN");
        mockSecurityContext("HSP_01");
        when(userRepository.findByUid("HSP_01")).thenReturn(Optional.of(hospitalAdmin));

        ResponseEntity<?> response = adminController.listHospitals();
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // ==========================================
    // 18. Ambulance Driver cannot access admin APIs
    // ==========================================
    @Test
    @DisplayName("18. Ambulance Driver cannot access admin APIs")
    void test18_AmbulanceDriverCannotAccessAdminApis() {
        User driver = new User("AMB_01", "driver@vitalguard.com", "pass", "AMBULANCE_DRIVER");
        mockSecurityContext("AMB_01");
        when(userRepository.findByUid("AMB_01")).thenReturn(Optional.of(driver));

        ResponseEntity<?> response = adminController.listAmbulances();
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // ==========================================
    // 19. Hospital Admin sees only their hospital
    // ==========================================
    @Test
    @DisplayName("19. Hospital Admin sees only their hospital")
    void test19_HospitalAdminSeesOnlyTheirHospital() {
        User hospitalAdmin = new User("HSP_01", "admin@apollo.com", "pass", "HOSPITAL_ADMIN");
        hospitalAdmin.setHospitalId(1L);
        mockSecurityContext("HSP_01");
        when(userRepository.findByUid("HSP_01")).thenReturn(Optional.of(hospitalAdmin));

        EmergencyRequest eq1 = new EmergencyRequest();
        eq1.setId(101L);
        eq1.setHospitalId(1L);

        when(emergencyRepository.findByHospitalId(1L)).thenReturn(List.of(eq1));

        ResponseEntity<?> response = hospitalController.getEmergencies();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        List<?> list = (List<?>) response.getBody();
        assertNotNull(list);
        assertEquals(1, list.size());
        verify(emergencyRepository).findByHospitalId(1L);
    }

    // ==========================================
    // 20. Doctor sees only assigned emergencies
    // ==========================================
    @Test
    @DisplayName("20. Doctor sees only assigned emergencies")
    void test20_DoctorSeesOnlyAssignedEmergencies() {
        User doctorUser = new User("DOC_01", "doctor@apollo.com", "pass", "DOCTOR");
        doctorUser.setId(5L);
        doctorUser.setDoctorId(1L);
        mockSecurityContext("DOC_01");
        when(userRepository.findByUid("DOC_01")).thenReturn(Optional.of(doctorUser));

        Doctor doctor = new Doctor();
        doctor.setId(1L);
        when(doctorRepository.findById(1L)).thenReturn(Optional.of(doctor));

        EmergencyRequest eq = new EmergencyRequest();
        eq.setId(201L);
        eq.setDoctorId(1L);

        when(emergencyRepository.findByDoctorId(1L)).thenReturn(List.of(eq));

        ResponseEntity<?> response = doctorController.getAssignedEmergencies();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        List<?> list = (List<?>) response.getBody();
        assertNotNull(list);
        assertEquals(1, list.size());
    }

    // ==========================================
    // 21. Driver sees only assigned ambulance
    // ==========================================
    @Test
    @DisplayName("21. Driver sees only assigned ambulance")
    void test21_DriverSeesOnlyAssignedAmbulance() {
        User driver = new User("AMB_01", "driver@apollo.com", "pass", "AMBULANCE_DRIVER");
        driver.setId(7L);
        driver.setAmbulanceId(10L);
        mockSecurityContext("AMB_01");
        when(userRepository.findByUid("AMB_01")).thenReturn(Optional.of(driver));

        Ambulance ambulance = new Ambulance("AMB-10", "Apollo Hospital", 12.92, 77.60);
        ambulance.setId(10L);
        when(ambulanceRepository.findByDriverId(7L)).thenReturn(Optional.of(ambulance));

        ResponseEntity<?> response = ambulanceController.getCurrentJob();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> map = (Map<?, ?>) response.getBody();
        assertNotNull(map);
        assertEquals(ambulance, map.get("ambulance"));
    }

    // ==========================================
    // 22. Deactivated account cannot login
    // ==========================================
    @Test
    @DisplayName("22. Deactivated account cannot login")
    void test22_DeactivatedAccountCannotLogin() {
        User user = new User("DOC_02", "deactivated@test.com", "encodedPass", "DOCTOR");
        user.setStatus("DEACTIVATED");

        when(userRepository.findByEmail("deactivated@test.com")).thenReturn(Optional.of(user));

        LoginRequest req = new LoginRequest();
        req.setEmail("deactivated@test.com");
        req.setPassword("password");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(req));
        assertEquals("Your account is currently inactive.", ex.getMessage());
    }

    // ==========================================
    // 23. Suspended account cannot login
    // ==========================================
    @Test
    @DisplayName("23. Suspended account cannot login")
    void test23_SuspendedAccountCannotLogin() {
        User user = new User("DOC_03", "suspended@test.com", "encodedPass", "DOCTOR");
        user.setStatus("SUSPENDED");

        when(userRepository.findByEmail("suspended@test.com")).thenReturn(Optional.of(user));

        LoginRequest req = new LoginRequest();
        req.setEmail("suspended@test.com");
        req.setPassword("password");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(req));
        assertEquals("Your account has been suspended. Contact system administrator.", ex.getMessage());
    }

    // ==========================================
    // 24. Active account can login
    // ==========================================
    @Test
    @DisplayName("24. Active account can login")
    void test24_ActiveAccountCanLogin() {
        User user = new User("PAT_99", "active@patient.com", "encodedPass", "PATIENT");
        user.setStatus("ACTIVE");

        when(userRepository.findByEmail("active@patient.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correctPass", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(user)).thenReturn("mockJwt");

        LoginRequest req = new LoginRequest();
        req.setEmail("active@patient.com");
        req.setPassword("correctPass");

        AuthResponse res = authService.login(req);
        assertNotNull(res);
        assertEquals("PAT_99", res.getUid());
    }

    // ==========================================
    // 25. DatabaseSeeder remains idempotent
    // ==========================================
    @Test
    @DisplayName("25. DatabaseSeeder remains idempotent")
    void test25_DatabaseSeederRemainsIdempotent() throws Exception {
        when(userRepository.existsByEmail(anyString())).thenReturn(true);
        when(hospitalRepository.count()).thenReturn(5L);
        when(ambulanceRepository.count()).thenReturn(5L);

        // Run seeder multiple times
        databaseSeeder.run();
        databaseSeeder.run();

        // Verify no duplicate entities were saved to empty tables
        verify(hospitalRepository, never()).save(any(Hospital.class));
        verify(ambulanceRepository, never()).save(any(Ambulance.class));
    }
}
