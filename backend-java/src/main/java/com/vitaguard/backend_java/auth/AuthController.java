package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final PasswordSetupService passwordSetupService;

    public AuthController(AuthService authService, UserRepository userRepository, PasswordSetupService passwordSetupService) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.passwordSetupService = passwordSetupService;
    }

    @GetMapping("/setup-password")
    public ResponseEntity<?> verifySetupToken(@RequestParam String token) {
        try {
            Map<String, Object> details = passwordSetupService.getTokenDetails(token);
            return ResponseEntity.ok(details);
        } catch (org.springframework.web.server.ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason()));
        }
    }

    @PostMapping("/setup-password")
    public ResponseEntity<?> completePasswordSetup(@RequestBody Map<String, String> body) {
        try {
            String token = body.get("token");
            String newPassword = body.get("newPassword");
            Map<String, Object> result = passwordSetupService.completePasswordSetup(token, newPassword);
            return ResponseEntity.ok(result);
        } catch (org.springframework.web.server.ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason()));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        try {
            AuthResponse response = authService.register(request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile() {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUid(uid)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody Map<String, Object> updates) {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUid(uid)
                .map(user -> {
                    if (updates.containsKey("fullName")) user.setFullName((String) updates.get("fullName"));
                    if (updates.containsKey("age")) user.setAge((Integer) updates.get("age"));
                    if (updates.containsKey("bloodGroup")) user.setBloodGroup((String) updates.get("bloodGroup"));
                    if (updates.containsKey("address")) user.setAddress((String) updates.get("address"));
                    if (updates.containsKey("latitude")) user.setLatitude(((Number) updates.get("latitude")).doubleValue());
                    if (updates.containsKey("longitude")) user.setLongitude(((Number) updates.get("longitude")).doubleValue());
                    if (updates.containsKey("doctorName")) user.setDoctorName((String) updates.get("doctorName"));
                    if (updates.containsKey("doctorPhone")) user.setDoctorPhone((String) updates.get("doctorPhone"));
                    if (updates.containsKey("doctorHospital")) user.setDoctorHospital((String) updates.get("doctorHospital"));
                    if (updates.containsKey("fcmToken")) user.setFcmToken((String) updates.get("fcmToken"));
                    
                    userRepository.save(user);
                    Map<String, String> res = new HashMap<>();
                    res.put("message", "Profile updated");
                    return ResponseEntity.ok(res);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // Alias path for compatibility with old portals calling GET /auth/profile
    @GetMapping("/auth/profile")
    public ResponseEntity<?> getProfileAlias() {
        return getProfile();
    }
}
