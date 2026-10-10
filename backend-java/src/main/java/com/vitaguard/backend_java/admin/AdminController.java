package com.vitaguard.backend_java.admin;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.auth.PasswordSetupService;
import com.vitaguard.backend_java.auth.PasswordSetupToken;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN')")
public class AdminController {

    private final UserRepository userRepository;
    private final DoctorRepository doctorRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    private final PasswordSetupService passwordSetupService;

    private static final List<String> ACTIVE_EMERGENCY_STATUSES = List.of(
            "DETECTED", "HOSPITAL_ASSIGNED", "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED",
            "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED", "AMBULANCE_DISPATCHED",
            "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP",
            "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"
    );

    public AdminController(
            UserRepository userRepository,
            DoctorRepository doctorRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            AmbulanceRepository ambulanceRepository,
            EmergencyRequestRepository emergencyRepository,
            PasswordEncoder passwordEncoder
    ) {
        this(userRepository, doctorRepository, hospitalRepository, departmentRepository,
             ambulanceRepository, emergencyRepository, passwordEncoder, null, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AdminController(
            UserRepository userRepository,
            DoctorRepository doctorRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            AmbulanceRepository ambulanceRepository,
            EmergencyRequestRepository emergencyRepository,
            PasswordEncoder passwordEncoder,
            AuditLogService auditLogService,
            PasswordSetupService passwordSetupService
    ) {
        this.userRepository = userRepository;
        this.doctorRepository = doctorRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.emergencyRepository = emergencyRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
        this.passwordSetupService = passwordSetupService;
    }

    private User getCurrentUser() {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUid(uid).orElse(null);
    }

    private boolean isSystemAdmin(User user) {
        return user != null && ("SYSTEM_ADMIN".equals(user.getRole()) || "ADMIN".equals(user.getRole()));
    }

    private ResponseEntity<?> checkSystemAdmin() {
        User currentUser = getCurrentUser();
        if (!isSystemAdmin(currentUser)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: SYSTEM_ADMIN role required"));
        }
        return null;
    }

    // ==========================================
    // 1. DASHBOARD OVERVIEW & STATS
    // ==========================================
    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        long totalUsers = userRepository.count();
        long activeDoctors = doctorRepository.count();
        long hospitals = hospitalRepository.count();
        long ambulances = ambulanceRepository.count();
        long ambulanceDrivers = userRepository.countByRole("AMBULANCE_DRIVER");
        long activeEmergencies = emergencyRepository.findByStatusIn(ACTIVE_EMERGENCY_STATUSES).size();
        long pendingApprovals = userRepository.countByStatus("PENDING");

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalUsers", totalUsers);
        stats.put("activeDoctors", activeDoctors);
        stats.put("hospitals", hospitals);
        stats.put("ambulances", ambulances);
        stats.put("ambulanceDrivers", ambulanceDrivers);
        stats.put("activeEmergencies", activeEmergencies);
        stats.put("pendingApprovals", pendingApprovals);

        return ResponseEntity.ok(stats);
    }

    // ==========================================
    // 2. USER MANAGEMENT & ACTIVATION
    // ==========================================
    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<User> users = userRepository.findAll();
        if (role != null && !role.trim().isEmpty() && !"ALL".equalsIgnoreCase(role)) {
            users = users.stream()
                    .filter(u -> role.equalsIgnoreCase(u.getRole()))
                    .collect(Collectors.toList());
        }
        if (status != null && !status.trim().isEmpty() && !"ALL".equalsIgnoreCase(status)) {
            users = users.stream()
                    .filter(u -> status.equalsIgnoreCase(u.getStatus()))
                    .collect(Collectors.toList());
        }

        List<Map<String, Object>> response = users.stream().map(this::toUserSummary).collect(Collectors.toList());
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/users/{id}/status")
    public ResponseEntity<?> updateUserStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }

        String newStatus = body.get("status");
        if (newStatus == null || !isValidStatus(newStatus)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status. Must be ACTIVE, PENDING, REJECTED, SUSPENDED, or DEACTIVATED."));
        }

        User user = userOpt.get();
        String oldStatus = user.getStatus();
        user.setStatus(newStatus.toUpperCase());
        userRepository.save(user);

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            String action;
            if ("ACTIVE".equalsIgnoreCase(newStatus)) {
                action = ("DEACTIVATED".equalsIgnoreCase(oldStatus) || "SUSPENDED".equalsIgnoreCase(oldStatus))
                        ? "REACTIVATE_USER" : "ACTIVATE_USER";
            } else if ("DEACTIVATED".equalsIgnoreCase(newStatus)) {
                action = "DEACTIVATE_USER";
            } else if ("SUSPENDED".equalsIgnoreCase(newStatus)) {
                action = "SUSPEND_USER";
            } else {
                action = "UPDATE_STATUS";
            }
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    action,
                    user.getId(),
                    user.getFullName(),
                    user.getRole(),
                    oldStatus,
                    user.getStatus(),
                    "Updated status of " + user.getRole() + " " + user.getFullName() + " from " + oldStatus + " to " + user.getStatus()
            );
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "User status updated to " + user.getStatus(),
                "user", toUserSummary(user)
        ));
    }

    @GetMapping("/pending-approvals")
    public ResponseEntity<?> getPendingApprovals() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<User> pendingUsers = userRepository.findByStatus("PENDING");
        return ResponseEntity.ok(pendingUsers.stream().map(this::toUserSummary).collect(Collectors.toList()));
    }

    @PostMapping("/users/{id}/approve")
    public ResponseEntity<?> approveUser(@PathVariable Long id) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }

        User user = userOpt.get();
        String oldStatus = user.getStatus();
        user.setStatus("ACTIVE");
        userRepository.save(user);

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "ACTIVATE_USER",
                    user.getId(),
                    user.getFullName(),
                    user.getRole(),
                    oldStatus,
                    "ACTIVE",
                    "Approved and activated account for " + user.getFullName()
            );
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Account has been activated.",
                "user", toUserSummary(user)
        ));
    }

    @PostMapping("/users/{id}/reject")
    public ResponseEntity<?> rejectUser(@PathVariable Long id) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }

        User user = userOpt.get();
        String oldStatus = user.getStatus();
        user.setStatus("REJECTED");
        userRepository.save(user);

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REJECT_USER",
                    user.getId(),
                    user.getFullName(),
                    user.getRole(),
                    oldStatus,
                    "REJECTED",
                    "Rejected account registration for " + user.getFullName()
            );
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Account registration rejected.",
                "user", toUserSummary(user)
        ));
    }

    // ==========================================
    // 3. DOCTOR MANAGEMENT
    // ==========================================
    @GetMapping("/doctors")
    public ResponseEntity<?> listDoctors() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<Doctor> doctors = doctorRepository.findAll();
        List<Map<String, Object>> response = doctors.stream().map(this::enrichDoctorResponse).collect(Collectors.toList());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/doctors")
    public ResponseEntity<?> registerDoctor(@RequestBody Map<String, Object> body) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        String name = (String) body.get("name");
        if (name == null) name = (String) body.get("fullName");
        String email = (String) body.get("email");
        String phone = (String) body.get("phone");
        String specialization = (String) body.get("specialization");
        String departmentName = (String) body.getOrDefault("departmentName", specialization);
        Object hospitalIdObj = body.get("hospitalId");

        boolean hasCustomPass = body.containsKey("password") && body.get("password") != null && !((String) body.get("password")).trim().isEmpty();
        String rawPass = hasCustomPass ? (String) body.get("password") : UUID.randomUUID().toString();
        boolean requireSetup = Boolean.TRUE.equals(body.get("requirePasswordSetup")) || !hasCustomPass;
        String initialStatus = requireSetup ? "PENDING" : "ACTIVE";
        if (body.containsKey("status") && isValidStatus((String) body.get("status"))) {
            initialStatus = ((String) body.get("status")).toUpperCase();
        }

        if (name == null || name.trim().isEmpty() || email == null || email.trim().isEmpty() || hospitalIdObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Name, email, and hospital selection are required."));
        }

        if (userRepository.existsByEmail(email.trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Email is already registered."));
        }

        Long hospitalId = ((Number) hospitalIdObj).longValue();
        Hospital hospital = hospitalRepository.findById(hospitalId).orElse(null);
        if (hospital == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Selected hospital does not exist."));
        }

        // 1. Create doctor entity profile
        Doctor doctor = new Doctor(hospital, name.trim(), phone, specialization, departmentName, true, true);
        doctorRepository.save(doctor);

        // 2. Create user account
        String uid = "DOC_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        User doctorUser = new User(
                uid,
                email.trim(),
                passwordEncoder.encode(rawPass),
                "DOCTOR"
        );
        doctorUser.setStatus(initialStatus);
        doctorUser.setFullName(name.trim());
        doctorUser.setPhone(phone);
        doctorUser.setHospitalId(hospital.getId());
        doctorUser.setDoctorHospital(hospital.getName());
        doctorUser.setDoctorId(doctor.getId());
        userRepository.save(doctorUser);

        // Update hospital doctor counts
        hospital.setTotalDoctors(hospital.getTotalDoctors() != null ? hospital.getTotalDoctors() + 1 : 1);
        hospital.setAvailableDoctors(hospital.getAvailableDoctors() != null ? hospital.getAvailableDoctors() + 1 : 1);
        hospitalRepository.save(hospital);

        String setupTokenStr = null;
        if (passwordSetupService != null) {
            PasswordSetupToken token = passwordSetupService.createSetupToken(doctorUser);
            setupTokenStr = token.getToken();
        }

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REGISTER_USER",
                    doctorUser.getId(),
                    doctorUser.getFullName(),
                    "DOCTOR",
                    "NONE",
                    doctorUser.getStatus(),
                    "Registered doctor Dr. " + name.trim() + " for hospital " + hospital.getName()
            );
        }

        Map<String, Object> res = enrichDoctorResponse(doctor);
        res.put("message", requireSetup ? "Doctor registered. Password setup link generated." : "Registration successful. Account has been activated.");
        res.put("userUid", doctorUser.getUid());
        if (setupTokenStr != null) {
            res.put("setupToken", setupTokenStr);
            res.put("setupUrl", "/setup-password?token=" + setupTokenStr);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @PutMapping("/doctors/{id}")
    public ResponseEntity<?> updateDoctor(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Doctor doctor = doctorRepository.findById(id).orElse(null);
        if (doctor == null) {
            return ResponseEntity.notFound().build();
        }

        if (body.containsKey("name")) doctor.setName((String) body.get("name"));
        if (body.containsKey("phone")) doctor.setPhone((String) body.get("phone"));
        if (body.containsKey("specialization")) doctor.setSpecialization((String) body.get("specialization"));
        if (body.containsKey("departmentName")) doctor.setDepartmentName((String) body.get("departmentName"));
        if (body.containsKey("onDuty")) doctor.setOnDuty((Boolean) body.get("onDuty"));
        if (body.containsKey("availableForEmergency")) doctor.setAvailableForEmergency((Boolean) body.get("availableForEmergency"));

        if (body.containsKey("hospitalId")) {
            Long hid = ((Number) body.get("hospitalId")).longValue();
            Hospital h = hospitalRepository.findById(hid).orElse(null);
            if (h != null) doctor.setHospital(h);
        }

        doctorRepository.save(doctor);

        // Also update associated user if present
        findUserForDoctor(doctor).ifPresent(user -> {
            if (body.containsKey("name")) user.setFullName(doctor.getName());
            if (body.containsKey("phone")) user.setPhone(doctor.getPhone());
            if (doctor.getHospital() != null) {
                user.setHospitalId(doctor.getHospital().getId());
                user.setDoctorHospital(doctor.getHospital().getName());
            }
            userRepository.save(user);
        });

        return ResponseEntity.ok(enrichDoctorResponse(doctor));
    }

    @PatchMapping("/doctors/{id}/status")
    public ResponseEntity<?> updateDoctorStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Doctor doctor = doctorRepository.findById(id).orElse(null);
        if (doctor == null) {
            return ResponseEntity.notFound().build();
        }

        String status = body.get("status");
        if (status == null || !isValidStatus(status)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status"));
        }

        Optional<User> userOpt = findUserForDoctor(doctor);
        String oldStatus = "UNKNOWN";
        if (userOpt.isPresent()) {
            User u = userOpt.get();
            oldStatus = u.getStatus();
            u.setStatus(status.toUpperCase());
            userRepository.save(u);

            if (auditLogService != null) {
                User currentUser = getCurrentUser();
                String action;
                if ("ACTIVE".equalsIgnoreCase(status)) {
                    action = ("DEACTIVATED".equalsIgnoreCase(oldStatus) || "SUSPENDED".equalsIgnoreCase(oldStatus))
                            ? "REACTIVATE_USER" : "ACTIVATE_USER";
                } else if ("DEACTIVATED".equalsIgnoreCase(status)) {
                    action = "DEACTIVATE_USER";
                } else if ("SUSPENDED".equalsIgnoreCase(status)) {
                    action = "SUSPEND_USER";
                } else {
                    action = "UPDATE_STATUS";
                }
                auditLogService.logAction(
                        currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                        currentUser != null ? currentUser.getFullName() : "System Administrator",
                        action,
                        u.getId(),
                        u.getFullName(),
                        "DOCTOR",
                        oldStatus,
                        u.getStatus(),
                        "Updated status of Doctor " + doctor.getName() + " from " + oldStatus + " to " + u.getStatus()
                );
            }
        }

        if ("DEACTIVATED".equalsIgnoreCase(status) || "SUSPENDED".equalsIgnoreCase(status)) {
            doctor.setOnDuty(false);
            doctor.setAvailableForEmergency(false);
            doctorRepository.save(doctor);
        } else if ("ACTIVE".equalsIgnoreCase(status)) {
            doctor.setOnDuty(true);
            doctor.setAvailableForEmergency(true);
            doctorRepository.save(doctor);
        }

        return ResponseEntity.ok(enrichDoctorResponse(doctor));
    }

    // ==========================================
    // 4. HOSPITAL ADMIN MANAGEMENT
    // ==========================================
    @GetMapping("/hospital-admins")
    public ResponseEntity<?> listHospitalAdmins() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<User> admins = userRepository.findByRole("HOSPITAL_ADMIN");
        List<Map<String, Object>> response = admins.stream().map(u -> {
            Map<String, Object> map = toUserSummary(u);
            if (u.getHospitalId() != null) {
                hospitalRepository.findById(u.getHospitalId()).ifPresent(h -> {
                    map.put("hospitalName", h.getName());
                    map.put("hospitalBeds", h.getTotalBeds());
                });
            }
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/hospital-admins")
    public ResponseEntity<?> registerHospitalAdmin(@RequestBody Map<String, Object> body) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        String name = (String) body.get("name");
        if (name == null) name = (String) body.get("fullName");
        String email = (String) body.get("email");
        String phone = (String) body.get("phone");
        Object hospitalIdObj = body.get("hospitalId");

        boolean hasCustomPass = body.containsKey("password") && body.get("password") != null && !((String) body.get("password")).trim().isEmpty();
        String rawPass = hasCustomPass ? (String) body.get("password") : UUID.randomUUID().toString();
        boolean requireSetup = Boolean.TRUE.equals(body.get("requirePasswordSetup")) || !hasCustomPass;
        String initialStatus = requireSetup ? "PENDING" : "ACTIVE";
        if (body.containsKey("status") && isValidStatus((String) body.get("status"))) {
            initialStatus = ((String) body.get("status")).toUpperCase();
        }

        if (name == null || name.trim().isEmpty() || email == null || email.trim().isEmpty() || hospitalIdObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Name, email, and hospital selection are required."));
        }

        if (userRepository.existsByEmail(email.trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Email is already registered."));
        }

        Long hospitalId = ((Number) hospitalIdObj).longValue();
        Hospital hospital = hospitalRepository.findById(hospitalId).orElse(null);
        if (hospital == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Selected hospital does not exist."));
        }

        String uid = "HSP_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        User adminUser = new User(
                uid,
                email.trim(),
                passwordEncoder.encode(rawPass),
                "HOSPITAL_ADMIN"
        );
        adminUser.setStatus(initialStatus);
        adminUser.setFullName(name.trim());
        adminUser.setPhone(phone);
        adminUser.setHospitalId(hospital.getId());
        userRepository.save(adminUser);

        String setupTokenStr = null;
        if (passwordSetupService != null) {
            PasswordSetupToken token = passwordSetupService.createSetupToken(adminUser);
            setupTokenStr = token.getToken();
        }

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REGISTER_USER",
                    adminUser.getId(),
                    adminUser.getFullName(),
                    "HOSPITAL_ADMIN",
                    "NONE",
                    adminUser.getStatus(),
                    "Registered hospital admin " + name.trim() + " for hospital " + hospital.getName()
            );
        }

        Map<String, Object> res = toUserSummary(adminUser);
        res.put("hospitalName", hospital.getName());
        res.put("message", requireSetup ? "Hospital Admin registered. Password setup link generated." : "Registration successful. Account has been activated.");
        if (setupTokenStr != null) {
            res.put("setupToken", setupTokenStr);
            res.put("setupUrl", "/setup-password?token=" + setupTokenStr);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @PatchMapping("/hospital-admins/{id}/status")
    public ResponseEntity<?> updateHospitalAdminStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        return updateUserStatus(id, body);
    }

    // ==========================================
    // 5. AMBULANCE DRIVER MANAGEMENT
    // ==========================================
    @GetMapping("/drivers")
    public ResponseEntity<?> listDrivers() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<User> drivers = userRepository.findByRole("AMBULANCE_DRIVER");
        List<Map<String, Object>> response = drivers.stream().map(d -> {
            Map<String, Object> map = toUserSummary(d);
            if (d.getAmbulanceId() != null) {
                ambulanceRepository.findById(d.getAmbulanceId()).ifPresent(amb -> {
                    map.put("ambulanceUnitId", amb.getUnitId());
                    map.put("ambulanceStatus", amb.getStatus());
                    map.put("ambulanceHospital", amb.getHospitalName());
                });
            }
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/drivers")
    public ResponseEntity<?> registerDriver(@RequestBody Map<String, Object> body) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        String name = (String) body.get("name");
        if (name == null) name = (String) body.get("fullName");
        String email = (String) body.get("email");
        String phone = (String) body.get("phone");
        Object ambulanceIdObj = body.get("ambulanceId");

        boolean hasCustomPass = body.containsKey("password") && body.get("password") != null && !((String) body.get("password")).trim().isEmpty();
        String rawPass = hasCustomPass ? (String) body.get("password") : UUID.randomUUID().toString();
        boolean requireSetup = Boolean.TRUE.equals(body.get("requirePasswordSetup")) || !hasCustomPass;
        String initialStatus = requireSetup ? "PENDING" : "ACTIVE";
        if (body.containsKey("status") && isValidStatus((String) body.get("status"))) {
            initialStatus = ((String) body.get("status")).toUpperCase();
        }

        if (name == null || name.trim().isEmpty() || email == null || email.trim().isEmpty() || ambulanceIdObj == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Name, email, and ambulance assignment are required."));
        }

        if (userRepository.existsByEmail(email.trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Email is already registered."));
        }

        Long ambulanceId = ((Number) ambulanceIdObj).longValue();
        Ambulance ambulance = ambulanceRepository.findById(ambulanceId).orElse(null);
        if (ambulance == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Selected ambulance does not exist."));
        }

        String uid = "AMB_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        User driverUser = new User(
                uid,
                email.trim(),
                passwordEncoder.encode(rawPass),
                "AMBULANCE_DRIVER"
        );
        driverUser.setStatus(initialStatus);
        driverUser.setFullName(name.trim());
        driverUser.setPhone(phone);
        driverUser.setAmbulanceId(ambulance.getId());
        userRepository.save(driverUser);

        // Link driver to ambulance
        ambulance.setDriver(driverUser);
        ambulanceRepository.save(ambulance);

        String setupTokenStr = null;
        if (passwordSetupService != null) {
            PasswordSetupToken token = passwordSetupService.createSetupToken(driverUser);
            setupTokenStr = token.getToken();
        }

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REGISTER_USER",
                    driverUser.getId(),
                    driverUser.getFullName(),
                    "AMBULANCE_DRIVER",
                    "NONE",
                    driverUser.getStatus(),
                    "Registered ambulance driver " + name.trim() + " for ambulance " + ambulance.getUnitId()
            );
        }

        Map<String, Object> res = toUserSummary(driverUser);
        res.put("ambulanceUnitId", ambulance.getUnitId());
        res.put("ambulanceHospital", ambulance.getHospitalName());
        res.put("message", requireSetup ? "Ambulance Driver registered. Password setup link generated." : "Registration successful. Account has been activated.");
        if (setupTokenStr != null) {
            res.put("setupToken", setupTokenStr);
            res.put("setupUrl", "/setup-password?token=" + setupTokenStr);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @PatchMapping("/drivers/{id}/status")
    public ResponseEntity<?> updateDriverStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        return updateUserStatus(id, body);
    }

    // ==========================================
    // 6. HOSPITAL MANAGEMENT
    // ==========================================
    @GetMapping("/hospitals")
    public ResponseEntity<?> listHospitals() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<Hospital> hospitals = hospitalRepository.findAll();
        List<Map<String, Object>> response = hospitals.stream().map(h -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", h.getId());
            map.put("name", h.getName());
            map.put("lat", h.getLat());
            map.put("lng", h.getLng());
            map.put("totalBeds", h.getTotalBeds());
            map.put("availableBeds", h.getAvailableBeds());
            map.put("totalDoctors", h.getTotalDoctors());
            map.put("availableDoctors", h.getAvailableDoctors());
            map.put("rating", h.getRating());

            // Associated doctors count
            map.put("doctorsCount", doctorRepository.findByHospitalId(h.getId()).size());
            // Associated admins count
            map.put("adminsCount", userRepository.findByHospitalId(h.getId()).stream().filter(u -> "HOSPITAL_ADMIN".equals(u.getRole())).count());
            // Associated ambulances
            map.put("ambulancesCount", ambulanceRepository.findByHospitalName(h.getName()).size());
            // Active emergencies incoming
            map.put("activeEmergencies", emergencyRepository.findByHospitalIdAndStatusIn(h.getId(), ACTIVE_EMERGENCY_STATUSES).size());
            map.put("status", "ACTIVE");

            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/hospitals")
    public ResponseEntity<?> createHospital(@RequestBody Map<String, Object> body) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        String name = (String) body.get("name");
        Double lat = body.containsKey("lat") ? ((Number) body.get("lat")).doubleValue() : 12.9716;
        Double lng = body.containsKey("lng") ? ((Number) body.get("lng")).doubleValue() : 77.5946;
        Integer totalBeds = body.containsKey("totalBeds") ? ((Number) body.get("totalBeds")).intValue() : 100;
        Integer availableBeds = body.containsKey("availableBeds") ? ((Number) body.get("availableBeds")).intValue() : totalBeds;
        Integer totalDoctors = body.containsKey("totalDoctors") ? ((Number) body.get("totalDoctors")).intValue() : 20;
        Integer availableDoctors = body.containsKey("availableDoctors") ? ((Number) body.get("availableDoctors")).intValue() : totalDoctors;
        Double rating = body.containsKey("rating") ? ((Number) body.get("rating")).doubleValue() : 4.5;

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Hospital name is required"));
        }

        if (hospitalRepository.findByName(name.trim()).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "A hospital with this name already exists."));
        }

        Hospital hospital = new Hospital(name.trim(), lat, lng, totalBeds, availableBeds, totalDoctors, availableDoctors, rating);
        hospitalRepository.save(hospital);

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REGISTER_HOSPITAL",
                    hospital.getId(),
                    hospital.getName(),
                    "HOSPITAL",
                    "NONE",
                    "ACTIVE",
                    "Registered hospital " + hospital.getName()
            );
        }

        // Seed basic departments
        List<String> deps = List.of("Emergency", "Cardiology", "Trauma", "General Medicine");
        for (String depName : deps) {
            HospitalDepartment dep = new HospitalDepartment(
                    hospital,
                    depName,
                    true,
                    true,
                    true,
                    availableBeds / 4,
                    totalBeds / 4,
                    availableDoctors / 4,
                    totalDoctors / 4
            );
            departmentRepository.save(dep);
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(hospital);
    }

    @PutMapping("/hospitals/{id}")
    public ResponseEntity<?> updateHospital(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Hospital h = hospitalRepository.findById(id).orElse(null);
        if (h == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name")) h.setName((String) body.get("name"));
        if (body.containsKey("lat")) h.setLat(((Number) body.get("lat")).doubleValue());
        if (body.containsKey("lng")) h.setLng(((Number) body.get("lng")).doubleValue());
        if (body.containsKey("totalBeds")) h.setTotalBeds(((Number) body.get("totalBeds")).intValue());
        if (body.containsKey("availableBeds")) h.setAvailableBeds(((Number) body.get("availableBeds")).intValue());
        if (body.containsKey("totalDoctors")) h.setTotalDoctors(((Number) body.get("totalDoctors")).intValue());
        if (body.containsKey("availableDoctors")) h.setAvailableDoctors(((Number) body.get("availableDoctors")).intValue());
        if (body.containsKey("rating")) h.setRating(((Number) body.get("rating")).doubleValue());

        hospitalRepository.save(h);
        return ResponseEntity.ok(h);
    }

    // ==========================================
    // 7. AMBULANCE MANAGEMENT
    // ==========================================
    @GetMapping("/ambulances")
    public ResponseEntity<?> listAmbulances() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<Ambulance> ambulances = ambulanceRepository.findAll();
        List<Map<String, Object>> response = ambulances.stream().map(a -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", a.getId());
            map.put("unitId", a.getUnitId());
            map.put("hospitalName", a.getHospitalName());
            map.put("status", a.getStatus());
            map.put("latitude", a.getLatitude());
            map.put("longitude", a.getLongitude());
            map.put("currentEmergencyId", a.getCurrentEmergencyId());

            if (a.getDriver() != null) {
                map.put("driverId", a.getDriver().getId());
                map.put("driverName", a.getDriver().getFullName());
                map.put("driverEmail", a.getDriver().getEmail());
                map.put("driverPhone", a.getDriver().getPhone());
                map.put("driverStatus", a.getDriver().getStatus());
            }

            if (a.getCurrentEmergencyId() != null) {
                emergencyRepository.findById(a.getCurrentEmergencyId()).ifPresent(e -> {
                    map.put("currentEmergencySeverity", e.getSeverity());
                    map.put("currentEmergencyStatus", e.getStatus());
                });
            }

            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/ambulances")
    public ResponseEntity<?> createAmbulance(@RequestBody Map<String, Object> body) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        String unitId = (String) body.get("unitId");
        String hospitalName = (String) body.get("hospitalName");
        Double lat = body.containsKey("latitude") ? ((Number) body.get("latitude")).doubleValue() : 12.9716;
        Double lng = body.containsKey("longitude") ? ((Number) body.get("longitude")).doubleValue() : 77.5946;

        if (unitId == null || unitId.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Ambulance unit ID is required"));
        }

        if (ambulanceRepository.findByUnitId(unitId.trim()).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Ambulance unit ID already exists"));
        }

        Ambulance ambulance = new Ambulance(unitId.trim(), hospitalName != null ? hospitalName : "City Central Hospital", lat, lng);
        ambulance.setStatus("AVAILABLE");

        if (body.containsKey("driverId") && body.get("driverId") != null) {
            Long driverId = ((Number) body.get("driverId")).longValue();
            userRepository.findById(driverId).ifPresent(ambulance::setDriver);
        }

        ambulanceRepository.save(ambulance);

        if (auditLogService != null) {
            User currentUser = getCurrentUser();
            auditLogService.logAction(
                    currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                    currentUser != null ? currentUser.getFullName() : "System Administrator",
                    "REGISTER_AMBULANCE",
                    ambulance.getId(),
                    ambulance.getUnitId(),
                    "AMBULANCE",
                    "NONE",
                    ambulance.getStatus(),
                    "Registered ambulance unit " + ambulance.getUnitId() + " for " + ambulance.getHospitalName()
            );
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(ambulance);
    }

    @PutMapping("/ambulances/{id}")
    public ResponseEntity<?> updateAmbulance(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        Ambulance ambulance = ambulanceRepository.findById(id).orElse(null);
        if (ambulance == null) return ResponseEntity.notFound().build();

        if (body.containsKey("unitId")) ambulance.setUnitId((String) body.get("unitId"));
        if (body.containsKey("hospitalName")) ambulance.setHospitalName((String) body.get("hospitalName"));
        if (body.containsKey("status")) {
            String newStatus = (String) body.get("status");
            ambulance.setStatus(newStatus);
            if ("AVAILABLE".equals(newStatus)) {
                ambulance.setCurrentEmergencyId(null);
            }
        }
        if (body.containsKey("latitude")) ambulance.setLatitude(((Number) body.get("latitude")).doubleValue());
        if (body.containsKey("longitude")) ambulance.setLongitude(((Number) body.get("longitude")).doubleValue());

        if (body.containsKey("driverId")) {
            if (body.get("driverId") == null) {
                ambulance.setDriver(null);
            } else {
                Long driverId = ((Number) body.get("driverId")).longValue();
                userRepository.findById(driverId).ifPresent(d -> {
                    ambulance.setDriver(d);
                    d.setAmbulanceId(ambulance.getId());
                    userRepository.save(d);

                    if (auditLogService != null) {
                        User currentUser = getCurrentUser();
                        auditLogService.logAction(
                                currentUser != null ? currentUser.getUid() : "SYS_ADMIN",
                                currentUser != null ? currentUser.getFullName() : "System Administrator",
                                "ASSIGN_DRIVER",
                                ambulance.getId(),
                                ambulance.getUnitId(),
                                "AMBULANCE",
                                "NONE",
                                ambulance.getStatus(),
                                "Assigned driver " + d.getFullName() + " to ambulance " + ambulance.getUnitId()
                        );
                    }
                });
            }
        }

        ambulanceRepository.save(ambulance);
        return ResponseEntity.ok(ambulance);
    }

    // ==========================================
    // 8. AUDIT LOGS
    // ==========================================
    @GetMapping("/audit-logs")
    public ResponseEntity<?> getAuditLogs() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null) return authCheck;

        List<AuditLog> logs = auditLogService != null ? auditLogService.getAllAuditLogs() : List.of();
        return ResponseEntity.ok(logs);
    }

    // ==========================================
    // HELPER METHODS
    // ==========================================
    private Map<String, Object> toUserSummary(User u) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", u.getId());
        map.put("uid", u.getUid());
        map.put("email", u.getEmail());
        map.put("role", u.getRole());
        map.put("fullName", u.getFullName());
        map.put("phone", u.getPhone() != null ? u.getPhone() : u.getDoctorPhone());
        map.put("status", u.getStatus() != null ? u.getStatus() : "ACTIVE");
        map.put("hospitalId", u.getHospitalId());
        map.put("ambulanceId", u.getAmbulanceId());
        map.put("doctorId", u.getDoctorId());
        return map;
    }

    private Optional<User> findUserForDoctor(Doctor doctor) {
        // Find by doctorId link
        List<User> byRole = userRepository.findByRole("DOCTOR");
        return byRole.stream()
                .filter(u -> (u.getDoctorId() != null && u.getDoctorId().equals(doctor.getId()))
                        || u.getId().equals(doctor.getId())
                        || (doctor.getName() != null && doctor.getName().equalsIgnoreCase(u.getFullName())))
                .findFirst();
    }

    private Map<String, Object> enrichDoctorResponse(Doctor d) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", d.getId());
        map.put("name", d.getName());
        map.put("phone", d.getPhone());
        map.put("specialization", d.getSpecialization());
        map.put("departmentName", d.getDepartmentName());
        map.put("onDuty", d.getOnDuty());
        map.put("availableForEmergency", d.getAvailableForEmergency());

        if (d.getHospital() != null) {
            map.put("hospitalId", d.getHospital().getId());
            map.put("hospitalName", d.getHospital().getName());
        }

        findUserForDoctor(d).ifPresent(u -> {
            map.put("userId", u.getId());
            map.put("userUid", u.getUid());
            map.put("email", u.getEmail());
            map.put("status", u.getStatus());
        });

        if (!map.containsKey("status")) {
            map.put("status", "ACTIVE");
        }

        return map;
    }

    private boolean isValidStatus(String status) {
        return List.of("ACTIVE", "PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED").contains(status.toUpperCase());
    }
}
