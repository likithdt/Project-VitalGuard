package com.vitaguard.backend_java.admin;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.auth.*;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.security.JwtAuthenticationFilter;
import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class EnhancedSecurityImprovementsTest {

    @Mock UserRepository userRepository;
    @Mock DoctorRepository doctorRepository;
    @Mock HospitalRepository hospitalRepository;
    @Mock HospitalDepartmentRepository departmentRepository;
    @Mock AmbulanceRepository ambulanceRepository;
    @Mock EmergencyRequestRepository emergencyRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;
    @Mock PasswordSetupTokenRepository tokenRepository;
    @Mock AuditLogRepository auditLogRepository;
    @Mock UserDetailsService userDetailsService;
    @Mock FilterChain filterChain;

    AuthService authService;
    PasswordSetupService passwordSetupService;
    AuditLogService auditLogService;
    AdminController adminController;
    JwtAuthenticationFilter jwtAuthenticationFilter;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, jwtService, authenticationManager);
        passwordSetupService = new PasswordSetupService(tokenRepository, userRepository, passwordEncoder);
        auditLogService = new AuditLogService(auditLogRepository);
        adminController = new AdminController(
                userRepository, doctorRepository, hospitalRepository,
                departmentRepository, ambulanceRepository, emergencyRepository,
                passwordEncoder, auditLogService, passwordSetupService
        );
        jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtService, userDetailsService);
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
    // JWT TESTS (1 - 8)
    // ==========================================

    @Test
    @DisplayName("1. Active user JWT works")
    void test1_ActiveUserJwtWorks() throws Exception {
        User activeUser = new User("DOC_01", "doctor@vitaguard.com", "pass", "DOCTOR");
        activeUser.setStatus("ACTIVE");

        when(jwtService.extractUsername("valid-jwt")).thenReturn("DOC_01");
        when(userDetailsService.loadUserByUsername("DOC_01")).thenReturn(activeUser);
        when(jwtService.isTokenValid("valid-jwt", activeUser)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer valid-jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("DOC_01", SecurityContextHolder.getContext().getAuthentication().getName());
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("2. Deactivated user's existing JWT is rejected")
    void test2_DeactivatedUserExistingJwtIsRejected() throws Exception {
        User deactivatedUser = new User("DOC_01", "doctor@vitaguard.com", "pass", "DOCTOR");
        deactivatedUser.setStatus("DEACTIVATED");

        when(jwtService.extractUsername("deactivated-jwt")).thenReturn("DOC_01");
        when(userDetailsService.loadUserByUsername("DOC_01")).thenReturn(deactivatedUser);
        when(jwtService.isTokenValid("deactivated-jwt", deactivatedUser)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer deactivated-jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        // Verification: Filter does NOT proceed to chain, returns 403 Forbidden immediately
        verify(filterChain, never()).doFilter(request, response);
        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("inactive"));
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("3. Suspended user's existing JWT is rejected")
    void test3_SuspendedUserExistingJwtIsRejected() throws Exception {
        User suspendedUser = new User("DRV_01", "driver@vitaguard.com", "pass", "AMBULANCE_DRIVER");
        suspendedUser.setStatus("SUSPENDED");

        when(jwtService.extractUsername("suspended-jwt")).thenReturn("DRV_01");
        when(userDetailsService.loadUserByUsername("DRV_01")).thenReturn(suspendedUser);
        when(jwtService.isTokenValid("suspended-jwt", suspendedUser)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer suspended-jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(filterChain, never()).doFilter(request, response);
        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("suspended"));
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    @DisplayName("4. Reactivated user can authenticate again")
    void test4_ReactivatedUserCanAuthenticateAgain() throws Exception {
        User user = new User("DOC_01", "doctor@vitaguard.com", "pass", "DOCTOR");
        // Status reactivated back to ACTIVE
        user.setStatus("ACTIVE");

        when(jwtService.extractUsername("reactivated-jwt")).thenReturn("DOC_01");
        when(userDetailsService.loadUserByUsername("DOC_01")).thenReturn(user);
        when(jwtService.isTokenValid("reactivated-jwt", user)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer reactivated-jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("DOC_01", SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @Test
    @DisplayName("5. Patient authentication still works")
    void test5_PatientAuthenticationStillWorks() {
        User patient = new User("PAT_01", "patient@test.com", "encodedPass", "PATIENT");
        patient.setStatus("ACTIVE");

        when(userRepository.findByEmail("patient@test.com")).thenReturn(Optional.of(patient));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(patient)).thenReturn("patient-jwt");

        LoginRequest req = new LoginRequest();
        req.setEmail("patient@test.com");
        req.setPassword("password");

        AuthResponse resp = authService.login(req);
        assertNotNull(resp);
        assertEquals("PATIENT", resp.getRole());
        assertEquals("patient-jwt", resp.getToken());
    }

    @Test
    @DisplayName("6. Doctor authentication still works")
    void test6_DoctorAuthenticationStillWorks() {
        User doctor = new User("DOC_01", "doctor@test.com", "encodedPass", "DOCTOR");
        doctor.setStatus("ACTIVE");

        when(userRepository.findByEmail("doctor@test.com")).thenReturn(Optional.of(doctor));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(doctor)).thenReturn("doctor-jwt");

        LoginRequest req = new LoginRequest();
        req.setEmail("doctor@test.com");
        req.setPassword("password");

        AuthResponse resp = authService.login(req);
        assertNotNull(resp);
        assertEquals("DOCTOR", resp.getRole());
        assertEquals("doctor-jwt", resp.getToken());
    }

    @Test
    @DisplayName("7. Hospital Admin authentication still works")
    void test7_HospitalAdminAuthenticationStillWorks() {
        User admin = new User("HSP_01", "hospital@test.com", "encodedPass", "HOSPITAL_ADMIN");
        admin.setStatus("ACTIVE");

        when(userRepository.findByEmail("hospital@test.com")).thenReturn(Optional.of(admin));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(admin)).thenReturn("admin-jwt");

        LoginRequest req = new LoginRequest();
        req.setEmail("hospital@test.com");
        req.setPassword("password");

        AuthResponse resp = authService.login(req);
        assertNotNull(resp);
        assertEquals("HOSPITAL_ADMIN", resp.getRole());
        assertEquals("admin-jwt", resp.getToken());
    }

    @Test
    @DisplayName("8. Ambulance Driver authentication still works")
    void test8_AmbulanceDriverAuthenticationStillWorks() {
        User driver = new User("AMB_01", "driver@test.com", "encodedPass", "AMBULANCE_DRIVER");
        driver.setStatus("ACTIVE");

        when(userRepository.findByEmail("driver@test.com")).thenReturn(Optional.of(driver));
        when(passwordEncoder.matches("password", "encodedPass")).thenReturn(true);
        when(jwtService.generateToken(driver)).thenReturn("driver-jwt");

        LoginRequest req = new LoginRequest();
        req.setEmail("driver@test.com");
        req.setPassword("password");

        AuthResponse resp = authService.login(req);
        assertNotNull(resp);
        assertEquals("AMBULANCE_DRIVER", resp.getRole());
        assertEquals("driver-jwt", resp.getToken());
    }

    // ==========================================
    // PASSWORD SETUP TESTS (9 - 15)
    // ==========================================

    @Test
    @DisplayName("9. Valid setup token works")
    void test9_ValidSetupTokenWorks() {
        User user = new User("DOC_02", "dr.new@apollo.com", "tempPass", "DOCTOR");
        user.setStatus("PENDING");

        PasswordSetupToken token = new PasswordSetupToken("secure-token-123", user, Instant.now().plus(48, ChronoUnit.HOURS));

        when(tokenRepository.findByToken("secure-token-123")).thenReturn(Optional.of(token));
        when(passwordEncoder.encode("DocNewSecret123!")).thenReturn("hashedPass456");

        Map<String, Object> result = passwordSetupService.completePasswordSetup("secure-token-123", "DocNewSecret123!");

        assertTrue((Boolean) result.get("success"));
        assertEquals("ACTIVE", user.getStatus());
        assertTrue(token.isUsed());
        assertNotNull(token.getUsedAt());
        verify(userRepository).save(user);
        verify(tokenRepository).save(token);
    }

    @Test
    @DisplayName("10. Expired setup token fails")
    void test10_ExpiredSetupTokenFails() {
        User user = new User("DOC_03", "expired@test.com", "tempPass", "DOCTOR");
        // Expired 1 hour ago
        PasswordSetupToken token = new PasswordSetupToken("expired-token", user, Instant.now().minus(1, ChronoUnit.HOURS));

        when(tokenRepository.findByToken("expired-token")).thenReturn(Optional.of(token));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                passwordSetupService.completePasswordSetup("expired-token", "NewPassword123!")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("expired"));
    }

    @Test
    @DisplayName("11. Used setup token fails")
    void test11_UsedSetupTokenFails() {
        User user = new User("DOC_04", "used@test.com", "tempPass", "DOCTOR");
        PasswordSetupToken token = new PasswordSetupToken("used-token", user, Instant.now().plus(24, ChronoUnit.HOURS));
        token.setUsed(true);

        when(tokenRepository.findByToken("used-token")).thenReturn(Optional.of(token));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                passwordSetupService.completePasswordSetup("used-token", "NewPassword123!")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("already been used"));
    }

    @Test
    @DisplayName("12. Invalid setup token fails")
    void test12_InvalidSetupTokenFails() {
        when(tokenRepository.findByToken("non-existent-token")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                passwordSetupService.completePasswordSetup("non-existent-token", "NewPassword123!")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Invalid"));
    }

    @Test
    @DisplayName("13. Password is hashed")
    void test13_PasswordIsHashed() {
        User user = new User("DOC_05", "hash@test.com", "tempPass", "DOCTOR");
        PasswordSetupToken token = new PasswordSetupToken("hash-token", user, Instant.now().plus(24, ChronoUnit.HOURS));

        when(tokenRepository.findByToken("hash-token")).thenReturn(Optional.of(token));
        when(passwordEncoder.encode("PlainPass123!")).thenReturn("$2a$10$e8w9u8y32u40823908u23u");

        passwordSetupService.completePasswordSetup("hash-token", "PlainPass123!");

        assertEquals("$2a$10$e8w9u8y32u40823908u23u", user.getPassword());
        assertNotEquals("PlainPass123!", user.getPassword());
        verify(passwordEncoder).encode("PlainPass123!");
    }

    @Test
    @DisplayName("14. Password is never returned in API response")
    void test14_PasswordIsNeverReturnedInApiResponse() {
        User user = new User("DOC_06", "secure@test.com", "tempPass", "DOCTOR");
        PasswordSetupToken token = new PasswordSetupToken("secure-tok", user, Instant.now().plus(24, ChronoUnit.HOURS));

        when(tokenRepository.findByToken("secure-tok")).thenReturn(Optional.of(token));
        when(passwordEncoder.encode(any())).thenReturn("hashed-pass");

        Map<String, Object> result = passwordSetupService.completePasswordSetup("secure-tok", "SecretPass123!");

        assertFalse(result.containsKey("password"));
        assertFalse(result.containsKey("newPassword"));
        assertFalse(result.containsValue("SecretPass123!"));
    }

    @Test
    @DisplayName("15. Password is never written to logs")
    void test15_PasswordIsNeverWrittenToLogs() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Hospital hospital = new Hospital("Apollo Hospital", 12.92, 77.60, 100, 80, 20, 15, 4.8);
        hospital.setId(1L);
        when(hospitalRepository.findById(1L)).thenReturn(Optional.of(hospital));
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = Map.of(
                "name", "Dr. Secret",
                "email", "dr.secret@apollo.com",
                "phone", "9876543210",
                "specialization", "Oncology",
                "hospitalId", 1L,
                "password", "TopSecretPass999!"
        );

        adminController.registerDoctor(body);

        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());

        AuditLog savedAudit = auditCaptor.getValue();
        assertFalse(savedAudit.getDescription().contains("TopSecretPass999!"));
        assertNotEquals("TopSecretPass999!", savedAudit.getDescription());
    }

    // ==========================================
    // AUDIT TESTS (16 - 22)
    // ==========================================

    @Test
    @DisplayName("16. Doctor registration creates audit record")
    void test16_DoctorRegistrationCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Hospital hospital = new Hospital("Fortis Hospital", 12.90, 77.58, 80, 60, 15, 10, 4.7);
        hospital.setId(2L);
        when(hospitalRepository.findById(2L)).thenReturn(Optional.of(hospital));
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = Map.of(
                "name", "Dr. Priya Nair",
                "email", "priya.nair@fortis.com",
                "hospitalId", 2L
        );

        adminController.registerDoctor(body);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("REGISTER_USER", audit.getAction());
        assertEquals("DOCTOR", audit.getTargetRole());
        assertEquals("SYS_01", audit.getAdminUserId());
        assertTrue(audit.getDescription().contains("Priya Nair"));
    }

    @Test
    @DisplayName("17. Doctor activation creates audit record")
    void test17_DoctorActivationCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Doctor doctor = new Doctor();
        doctor.setId(10L);
        doctor.setName("Dr. Amit Verma");
        when(doctorRepository.findById(10L)).thenReturn(Optional.of(doctor));

        User doctorUser = new User("DOC_10", "amit@vitaguard.com", "pass", "DOCTOR");
        doctorUser.setStatus("PENDING");
        doctorUser.setDoctorId(10L);
        when(userRepository.findByRole("DOCTOR")).thenReturn(List.of(doctorUser));

        adminController.updateDoctorStatus(10L, Map.of("status", "ACTIVE"));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("ACTIVATE_USER", audit.getAction());
        assertEquals("PENDING", audit.getOldStatus());
        assertEquals("ACTIVE", audit.getNewStatus());
    }

    @Test
    @DisplayName("18. User deactivation creates audit record")
    void test18_UserDeactivationCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        User targetUser = new User("DOC_11", "target@vitaguard.com", "pass", "DOCTOR");
        targetUser.setId(11L);
        targetUser.setStatus("ACTIVE");
        when(userRepository.findById(11L)).thenReturn(Optional.of(targetUser));

        adminController.updateUserStatus(11L, Map.of("status", "DEACTIVATED"));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("DEACTIVATE_USER", audit.getAction());
        assertEquals("ACTIVE", audit.getOldStatus());
        assertEquals("DEACTIVATED", audit.getNewStatus());
    }

    @Test
    @DisplayName("19. User suspension creates audit record")
    void test19_UserSuspensionCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        User targetUser = new User("DRV_05", "driver5@vitaguard.com", "pass", "AMBULANCE_DRIVER");
        targetUser.setId(15L);
        targetUser.setStatus("ACTIVE");
        when(userRepository.findById(15L)).thenReturn(Optional.of(targetUser));

        adminController.updateUserStatus(15L, Map.of("status", "SUSPENDED"));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("SUSPEND_USER", audit.getAction());
        assertEquals("ACTIVE", audit.getOldStatus());
        assertEquals("SUSPENDED", audit.getNewStatus());
    }

    @Test
    @DisplayName("20. Driver registration creates audit record")
    void test20_DriverRegistrationCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Ambulance ambulance = new Ambulance("AMB-10", "Manipal Hospital", 12.93, 77.58);
        ambulance.setId(10L);
        when(ambulanceRepository.findById(10L)).thenReturn(Optional.of(ambulance));
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = Map.of(
                "name", "Suresh Kumar",
                "email", "suresh.kumar@vitaguard.com",
                "ambulanceId", 10L
        );

        adminController.registerDriver(body);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("REGISTER_USER", audit.getAction());
        assertEquals("AMBULANCE_DRIVER", audit.getTargetRole());
        assertTrue(audit.getDescription().contains("Suresh Kumar"));
    }

    @Test
    @DisplayName("21. Hospital Admin registration creates audit record")
    void test21_HospitalAdminRegistrationCreatesAuditRecord() {
        User sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", "pass", "SYSTEM_ADMIN");
        mockSecurityContext("SYS_01");
        when(userRepository.findByUid("SYS_01")).thenReturn(Optional.of(sysAdmin));

        Hospital hospital = new Hospital("Columbia Asia", 12.95, 77.62, 120, 90, 25, 20, 4.6);
        hospital.setId(3L);
        when(hospitalRepository.findById(3L)).thenReturn(Optional.of(hospital));
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = Map.of(
                "name", "Ramesh Babu",
                "email", "ramesh.babu@columbia.com",
                "hospitalId", 3L
        );

        adminController.registerHospitalAdmin(body);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog audit = captor.getValue();
        assertEquals("REGISTER_USER", audit.getAction());
        assertEquals("HOSPITAL_ADMIN", audit.getTargetRole());
        assertTrue(audit.getDescription().contains("Ramesh Babu"));
    }

    @Test
    @DisplayName("22. Unauthorized users cannot access audit logs")
    void test22_UnauthorizedUsersCannotAccessAuditLogs() {
        User doctorUser = new User("DOC_01", "doctor@vitaguard.com", "pass", "DOCTOR");
        mockSecurityContext("DOC_01");
        when(userRepository.findByUid("DOC_01")).thenReturn(Optional.of(doctorUser));

        ResponseEntity<?> response = adminController.getAuditLogs();
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(auditLogRepository, never()).findAllByOrderByTimestampDesc();
    }
}
