package com.vitaguard.backend_java.config;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.Optional;

@Component
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final UserRepository userRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;
    private final EmergencyRequestRepository emergencyRepository;

    public WebSocketAuthChannelInterceptor(
            JwtService jwtService,
            UserDetailsService userDetailsService,
            UserRepository userRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            EmergencyRequestRepository emergencyRepository
    ) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.userRepository = userRepository;
        this.relationshipRepository = relationshipRepository;
        this.emergencyRepository = emergencyRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader == null) {
                authHeader = accessor.getFirstNativeHeader("authorization");
            }
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    String username = jwtService.extractUsername(token);
                    if (username != null) {
                        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                        if (jwtService.isTokenValid(token, userDetails)) {
                            UsernamePasswordAuthenticationToken auth =
                                    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                            accessor.setUser(auth);
                        }
                    }
                } catch (Exception ignored) {
                    // Token invalid or expired
                }
            }
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination != null) {
                authorizeSubscription(destination, accessor);
            }
        }

        return message;
    }

    private void authorizeSubscription(String destination, StompHeaderAccessor accessor) {
        // Public/general broadcast topics:
        if ("/topic/emergency-updates".equals(destination) || "/topic/hospital-queue-refresh".equals(destination)) {
            return;
        }

        Principal principal = accessor.getUser();
        // Check if authorization header is attached to SUBSCRIBE frame
        if (principal == null) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader == null) authHeader = accessor.getFirstNativeHeader("authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                try {
                    String token = authHeader.substring(7);
                    String username = jwtService.extractUsername(token);
                    if (username != null) {
                        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                        if (jwtService.isTokenValid(token, userDetails)) {
                            UsernamePasswordAuthenticationToken auth =
                                    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                            accessor.setUser(auth);
                            principal = auth;
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        // If unauthenticated:
        if (principal == null) {
            // Role-specific topics require authentication
            if (destination.startsWith("/topic/doctor/") || destination.startsWith("/topic/hospital/")
                    || destination.startsWith("/topic/ambulance/request/") || destination.startsWith("/topic/family-notifications/")) {
                throw new AccessDeniedException("Authentication required to subscribe to " + destination);
            }
            return;
        }

        String userUid = principal.getName();
        User user = userRepository.findByUid(userUid).or(() -> userRepository.findByEmail(userUid)).orElse(null);
        if (user == null) {
            throw new AccessDeniedException("User not found for topic authorization");
        }

        // SYSTEM_ADMIN has permission for all channels
        if ("SYSTEM_ADMIN".equals(user.getRole())) {
            return;
        }

        // 1. Doctor emergencies: /topic/doctor/{doctorId}/emergencies
        if (destination.startsWith("/topic/doctor/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 4) {
                String docIdStr = parts[3];
                try {
                    Long targetDocId = Long.parseLong(docIdStr);
                    if ("DOCTOR".equals(user.getRole())) {
                        Long userDocId = user.getDoctorId() != null ? user.getDoctorId() : user.getId();
                        if (targetDocId.equals(userDocId) || targetDocId.equals(user.getId())) {
                            return;
                        }
                    }
                    throw new AccessDeniedException("Unauthorized to subscribe to doctor emergencies");
                } catch (NumberFormatException ignored) {}
            }
        }

        // 2. Hospital emergencies: /topic/hospital/{hospitalId}/emergencies
        if (destination.startsWith("/topic/hospital/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 4) {
                String hospIdStr = parts[3];
                try {
                    Long targetHospId = Long.parseLong(hospIdStr);
                    if ("HOSPITAL_ADMIN".equals(user.getRole()) && targetHospId.equals(user.getHospitalId())) {
                        return;
                    }
                    if ("DOCTOR".equals(user.getRole()) && targetHospId.equals(user.getHospitalId())) {
                        return;
                    }
                    throw new AccessDeniedException("Unauthorized to subscribe to hospital emergencies");
                } catch (NumberFormatException ignored) {}
            }
        }

        // 3. Driver ambulance request: /topic/ambulance/request/{driverId}
        if (destination.startsWith("/topic/ambulance/request/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 5) {
                String driverIdStr = parts[4];
                try {
                    Long targetDriverId = Long.parseLong(driverIdStr);
                    if ("AMBULANCE_DRIVER".equals(user.getRole()) && targetDriverId.equals(user.getId())) {
                        return;
                    }
                    throw new AccessDeniedException("Unauthorized to subscribe to driver requests");
                } catch (NumberFormatException ignored) {}
            }
        }

        // 4. Ambulance telemetry: /topic/ambulance/{ambulanceId}
        if (destination.startsWith("/topic/ambulance/") && !destination.contains("/request/")) {
            return;
        }

        // 5. Family notifications: /topic/family-notifications/{patientUid}
        if (destination.startsWith("/topic/family-notifications/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 4) {
                String patientUid = parts[3];
                if (patientUid.equals(user.getUid())) {
                    return;
                }
                if ("FAMILY_MEMBER".equals(user.getRole()) && relationshipRepository != null) {
                    User patient = userRepository.findByUid(patientUid).orElse(null);
                    if (patient != null && relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), user.getId())) {
                        return;
                    }
                }
                throw new AccessDeniedException("Unauthorized to subscribe to family notifications");
            }
        }

        // 6. Vitals and AI Risk: /topic/vitals/{patientUid} or /topic/ai-risk/{patientUid}
        if (destination.startsWith("/topic/vitals/") || destination.startsWith("/topic/ai-risk/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 4) {
                String patientUid = parts[3];
                if (patientUid.equals(user.getUid())) {
                    return;
                }
                if ("FAMILY_MEMBER".equals(user.getRole()) && relationshipRepository != null) {
                    User patient = userRepository.findByUid(patientUid).orElse(null);
                    if (patient != null && relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), user.getId())) {
                        return;
                    }
                }
                if ("DOCTOR".equals(user.getRole()) || "HOSPITAL_ADMIN".equals(user.getRole())) {
                    return;
                }
                throw new AccessDeniedException("Unauthorized to subscribe to patient telemetry");
            }
        }

        // 7. Specific emergency: /topic/emergency/{emergencyId}
        if (destination.startsWith("/topic/emergency/")) {
            String[] parts = destination.split("/");
            if (parts.length >= 4) {
                try {
                    Long emergencyId = Long.parseLong(parts[3]);
                    Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(emergencyId);
                    if (reqOpt.isPresent()) {
                        EmergencyRequest req = reqOpt.get();
                        if (user.getUid().equals(req.getPatientUid())) return;
                        if ("HOSPITAL_ADMIN".equals(user.getRole()) && user.getHospitalId() != null && user.getHospitalId().equals(req.getHospitalId())) return;
                        if ("DOCTOR".equals(user.getRole())) {
                            Long docProfileId = user.getDoctorId() != null ? user.getDoctorId() : user.getId();
                            if (req.getDoctorId() != null && (req.getDoctorId().equals(docProfileId) || req.getDoctorId().equals(user.getId()))) return;
                        }
                        if ("AMBULANCE_DRIVER".equals(user.getRole()) && user.getAmbulanceId() != null && user.getAmbulanceId().equals(req.getAmbulanceId())) return;
                        if ("FAMILY_MEMBER".equals(user.getRole()) && relationshipRepository != null) {
                            User patient = userRepository.findByUid(req.getPatientUid()).orElse(null);
                            if (patient != null && relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), user.getId())) return;
                        }
                    }
                } catch (NumberFormatException ignored) {}
            }
        }
    }
}
