package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import com.vitaguard.backend_java.admin.AuditLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

@Service
public class PasswordSetupService {

    private final PasswordSetupTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public PasswordSetupService(
            PasswordSetupTokenRepository tokenRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Autowired(required = false) AuditLogService auditLogService
    ) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
    }

    public PasswordSetupService(
            PasswordSetupTokenRepository tokenRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this(tokenRepository, userRepository, passwordEncoder, null);
    }

    /**
     * Generates a cryptographically secure, single-use password setup token valid for 48 hours.
     */
    public PasswordSetupToken createSetupToken(User user) {
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        String tokenStr = UUID.randomUUID().toString().replace("-", "") +
                Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);

        // 48 hours expiration
        Instant expiryDate = Instant.now().plus(48, ChronoUnit.HOURS);
        PasswordSetupToken setupToken = new PasswordSetupToken(tokenStr, user, expiryDate);
        return tokenRepository.save(setupToken);
    }

    /**
     * Validates that the token exists, is not expired, and has not been used.
     */
    public PasswordSetupToken validateToken(String tokenStr) {
        if (tokenStr == null || tokenStr.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password setup token is required.");
        }

        PasswordSetupToken token = tokenRepository.findByToken(tokenStr.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid password setup token."));

        if (token.isUsed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password setup token has already been used.");
        }

        if (token.isExpired()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password setup token has expired.");
        }

        User user = token.getUser();
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No user associated with this token.");
        }

        return token;
    }

    /**
     * Returns sanitized details for the token verification UI (without secrets).
     */
    public Map<String, Object> getTokenDetails(String tokenStr) {
        PasswordSetupToken token = validateToken(tokenStr);
        User user = token.getUser();

        return Map.of(
                "valid", true,
                "email", user.getEmail(),
                "fullName", user.getFullName() != null ? user.getFullName() : "",
                "role", user.getRole(),
                "expiresAt", token.getExpiryDate().toString()
        );
    }

    /**
     * Sets user's password, hashes with PasswordEncoder, marks token as used, and activates account.
     * NEVER returns or logs the password.
     */
    public Map<String, Object> completePasswordSetup(String tokenStr, String newPassword) {
        PasswordSetupToken token = validateToken(tokenStr);

        if (newPassword == null || newPassword.trim().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters long.");
        }

        User user = token.getUser();
        String oldStatus = user.getStatus();
        // Hash password securely
        user.setPassword(passwordEncoder.encode(newPassword));
        // Activate account
        user.setStatus("ACTIVE");
        userRepository.save(user);

        // Mark token as used
        token.setUsed(true);
        token.setUsedAt(Instant.now());
        tokenRepository.save(token);

        if (auditLogService != null) {
            auditLogService.logAction(
                    "SYSTEM_SETUP",
                    "Password Setup Service",
                    "ACTIVATE_USER",
                    user.getId(),
                    user.getFullName(),
                    user.getRole(),
                    oldStatus != null ? oldStatus : "PENDING",
                    "ACTIVE",
                    "Completed password setup and activated " + user.getRole() + " account for " + user.getFullName()
            );
        }

        return Map.of(
                "success", true,
                "message", "Password has been successfully set. Your account is now active.",
                "email", user.getEmail(),
                "role", user.getRole()
        );
    }
}
