package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final com.vitaguard.backend_java.doctor.DoctorRepository doctorRepository;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthenticationManager authenticationManager
    ) {
        this(userRepository, passwordEncoder, jwtService, authenticationManager, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthenticationManager authenticationManager,
            @org.springframework.context.annotation.Lazy com.vitaguard.backend_java.doctor.DoctorRepository doctorRepository
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.doctorRepository = doctorRepository;
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already in use");
        }

        // Only allow public registration for PATIENT and FAMILY_MEMBER roles
        String role = request.getRole();
        if (role == null || (!"PATIENT".equalsIgnoreCase(role) && !"FAMILY_MEMBER".equalsIgnoreCase(role))) {
            throw new IllegalArgumentException("Invalid role for public registration. Privileged roles (DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER, SYSTEM_ADMIN) cannot be self-registered.");
        }
        role = role.toUpperCase();

        // Generate a clean UID for compatibility
        String prefix = "USR";
        if ("PATIENT".equals(role)) prefix = "PAT";
        else if ("FAMILY_MEMBER".equals(role)) prefix = "FAM";

        String uid = prefix + "_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();

        User user = new User(
                uid,
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                role
        );
        user.setStatus("ACTIVE");
        user.setFullName(request.getFullName());
        user.setAge(request.getAge());
        user.setBloodGroup(request.getBloodGroup());
        user.setAddress(request.getAddress());
        user.setPhone(request.getPhone() != null ? request.getPhone() : request.getDoctorPhone());
        user.setLatitude(request.getLatitude());
        user.setLongitude(request.getLongitude());
        user.setDoctorName(request.getDoctorName());
        user.setDoctorPhone(request.getDoctorPhone());
        user.setDoctorHospital(request.getDoctorHospital());

        userRepository.save(user);
        String jwtToken = jwtService.generateToken(user);
        return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName(), user.getHospitalId(), user.getAmbulanceId(), user.getId(), user.getDoctorId());
    }

    public AuthResponse login(LoginRequest request) {
        if (request.getEmail() == null || request.getEmail().trim().isEmpty()) {
            throw new IllegalArgumentException("Email/UID is required");
        }
        String identifier = request.getEmail().trim();

        // 1 & 2. Find user by email or UID
        User user = userRepository.findByEmail(identifier)
                .or(() -> userRepository.findByUid(identifier))
                .orElseThrow(() -> new IllegalArgumentException("Your account has not been registered by the system administrator."));

        // 3. Verify account status before authenticating
        String status = user.getStatus();
        if (status == null || !"ACTIVE".equalsIgnoreCase(status)) {
            if ("PENDING".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account is waiting for administrator approval.");
            } else if ("REJECTED".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account registration was rejected.");
            } else if ("SUSPENDED".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account has been suspended. Contact system administrator.");
            } else if ("DEACTIVATED".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account is currently inactive.");
            } else {
                throw new IllegalArgumentException("Your account has not been registered by the system administrator.");
            }
        }

        // 4. Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email/UID or password");
        }

        // 5. Authenticate session with Spring Security
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        user.getUid(),
                        request.getPassword()
                )
        );

        // 6. Resolve doctor profile if user is DOCTOR
        Long doctorId = user.getDoctorId();
        if (doctorId == null && "DOCTOR".equals(user.getRole()) && doctorRepository != null && user.getHospitalId() != null) {
            doctorId = doctorRepository.findByHospitalId(user.getHospitalId()).stream()
                    .filter(d -> d.getName().equalsIgnoreCase(user.getFullName()) || (d.getPhone() != null && d.getPhone().equals(user.getPhone())))
                    .map(com.vitaguard.backend_java.doctor.Doctor::getId)
                    .findFirst()
                    .orElse(null);
            if (doctorId != null) {
                user.setDoctorId(doctorId);
                userRepository.save(user);
            }
        }

        // 7. Generate JWT token
        String jwtToken = jwtService.generateToken(user);
        return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName(), user.getHospitalId(), user.getAmbulanceId(), user.getId(), doctorId != null ? doctorId : user.getId());
    }
}
