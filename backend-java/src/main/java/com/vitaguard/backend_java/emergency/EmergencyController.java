package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequest;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import com.vitaguard.backend_java.user.PatientFamilyRelationship;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/emergency")
public class EmergencyController {

    private final EmergencyService emergencyService;
    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;
    private final EmergencyEventRepository eventRepository;
    private final AmbulanceRequestRepository ambulanceRequestRepository;
    private final EmergencyWorkflowService workflowService;

    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository
    ) {
        this(emergencyService, emergencyRepository, hospitalRepository, doctorRepository, ambulanceRepository, userRepository, null, null, null, null);
    }

    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            EmergencyEventRepository eventRepository
    ) {
        this(emergencyService, emergencyRepository, hospitalRepository, doctorRepository, ambulanceRepository, userRepository, relationshipRepository, eventRepository, null, null);
    }

    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            EmergencyEventRepository eventRepository,
            AmbulanceRequestRepository ambulanceRequestRepository
    ) {
        this(emergencyService, emergencyRepository, hospitalRepository, doctorRepository, ambulanceRepository, userRepository, relationshipRepository, eventRepository, ambulanceRequestRepository, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            EmergencyEventRepository eventRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) AmbulanceRequestRepository ambulanceRequestRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) EmergencyWorkflowService workflowService
    ) {
        this.emergencyService = emergencyService;
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.relationshipRepository = relationshipRepository;
        this.eventRepository = eventRepository;
        this.ambulanceRequestRepository = ambulanceRequestRepository;
        this.workflowService = workflowService;
    }

    @PostMapping("/sos")
    public ResponseEntity<?> triggerSos(@RequestBody Map<String, Object> body) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);
        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String targetPatientUid = (String) body.get("patientUid");
        if (targetPatientUid == null || targetPatientUid.isEmpty()) {
            targetPatientUid = (String) body.get("patient_uid");
        }
        if (targetPatientUid == null || targetPatientUid.isEmpty()) {
            targetPatientUid = requesterUid;
        }

        // Authorization check: requester must be patient, linked family member, or admin
        boolean isAuthorized = requesterUid.equals(targetPatientUid) || "ADMIN".equals(requester.getRole());
        if (!isAuthorized && relationshipRepository != null) {
            User targetPatient = userRepository.findByUid(targetPatientUid).orElse(null);
            if (targetPatient != null) {
                isAuthorized = relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(targetPatient.getId(), requester.getId());
            }
        }
        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to request emergency for this patient"));
        }

        String alertMessage = (String) body.getOrDefault("alert_message", "Emergency Alert");
        String symptomDescription = (String) body.getOrDefault("description", "");
        String emergencyType = (String) body.getOrDefault("emergencyType", body.getOrDefault("emergency_type", "Medical Emergency"));
        String pickupAddress = (String) body.getOrDefault("pickupAddress", body.getOrDefault("pickup_address", body.getOrDefault("address", "")));

        // Parse list of symptoms
        List<String> symptomsList = (List<String>) body.get("symptoms");
        String symptoms = symptomsList != null ? String.join(",", symptomsList) : alertMessage;

        Map<String, Object> location = (Map<String, Object>) body.get("location");
        Double lat = 12.9716;
        Double lng = 77.5946;
        if (location != null) {
            if (location.get("lat") instanceof Number n) lat = n.doubleValue();
            if (location.get("lng") instanceof Number n) lng = n.doubleValue();
        } else {
            if (body.get("lat") instanceof Number n) lat = n.doubleValue();
            else if (body.get("latitude") instanceof Number n) lat = n.doubleValue();
            if (body.get("lng") instanceof Number n) lng = n.doubleValue();
            else if (body.get("longitude") instanceof Number n) lng = n.doubleValue();
        }

        // Check for duplicate active emergency on target patient
        List<EmergencyRequest> activeEmergencies = emergencyRepository.findByPatientUidAndStatusIn(targetPatientUid, List.of(
                "CREATED", "SEARCHING_HOSPITAL", "DETECTED", "HOSPITAL_ASSIGNED", "ACCEPTED", "HOSPITAL_ACCEPTED", "DOCTOR_ASSIGNED",
                "FAMILY_NOTIFIED", "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED", "AMBULANCE_DISPATCHED",
                "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
                "ARRIVED_AT_HOSPITAL"
        ));
        if (!activeEmergencies.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Active emergency already exists for this patient"));
        }

        Boolean requiresAmbulance = true;
        if (body.containsKey("requiresAmbulance")) {
            requiresAmbulance = (Boolean) body.get("requiresAmbulance");
        } else if (body.containsKey("ambulance_required")) {
            requiresAmbulance = (Boolean) body.get("ambulance_required");
        }

        EmergencyRequest request = emergencyService.triggerSos(targetPatientUid, lat, lng, symptoms, symptomDescription, requiresAmbulance);
        request.setPickupAddress(pickupAddress);
        request.setEmergencyType(emergencyType);
        if (!requesterUid.equals(targetPatientUid)) {
            request.setGuardianUid(requesterUid);
        }
        if (body.containsKey("hospitalId")) {
            request.setHospitalId(((Number) body.get("hospitalId")).longValue());
        }
        emergencyRepository.save(request);

        return ResponseEntity.ok(request);
    }

    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<?> getEmergencyRequest(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization validation:
        // Patient: own emergency only
        // Family: linked patient only (checked via relationship)
        // Doctor: assigned emergencies only
        // Hospital Admin: emergencies assigned to their hospital only
        // System Admin: all emergencies
        boolean isAuthorized = false;
        String role = requester.getRole();

        if (requesterUid.equals(request.getPatientUid())) {
            isAuthorized = true; // Patient owns the emergency
        } else if ("FAMILY_MEMBER".equals(role)) {
            User patient = userRepository.findByUid(request.getPatientUid()).orElse(null);
            if (patient != null && relationshipRepository != null) {
                isAuthorized = relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), requester.getId());
            }
        } else if ("DOCTOR".equals(role)) {
            // Doctor can only access emergencies assigned to them
            if (request.getDoctorId() != null && request.getDoctorId() > 0) {
                Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();
                isAuthorized = request.getDoctorId().equals(docProfileId) || request.getDoctorId().equals(requester.getId());
            }
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            // Hospital admin can only access emergencies assigned to their hospital
            if (requester.getHospitalId() != null && request.getHospitalId() != null) {
                isAuthorized = requester.getHospitalId().equals(request.getHospitalId());
            }
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            // Ambulance driver can access emergencies assigned to their ambulance
            Long ambId = request.getAmbulanceId();
            if (ambId == null) {
                Optional<Ambulance> ambOpt = ambulanceRepository.findByCurrentEmergencyId(request.getId());
                if (ambOpt.isPresent()) {
                    ambId = ambOpt.get().getId();
                }
            }
            if (ambId != null && requester.getAmbulanceId() != null) {
                isAuthorized = requester.getAmbulanceId().equals(ambId);
            }
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to view this emergency event");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        return ResponseEntity.ok(enrichEmergency(request));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<?> acceptCase(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Verify role is HOSPITAL_ADMIN or SYSTEM_ADMIN
        if (!"HOSPITAL_ADMIN".equals(requester.getRole()) && !"SYSTEM_ADMIN".equals(requester.getRole()) && !"ADMIN".equals(requester.getRole())) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Only hospital administrators can accept emergencies");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        // Verify hospital admin is linked to a hospital
        if (requester.getHospitalId() == null && !"SYSTEM_ADMIN".equals(requester.getRole()) && !"ADMIN".equals(requester.getRole())) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Hospital admin not linked to a hospital");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(err);
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Verify emergency belongs to this hospital (unless SYSTEM_ADMIN)
        if (requester.getHospitalId() != null && !requester.getHospitalId().equals(request.getHospitalId()) && !"SYSTEM_ADMIN".equals(requester.getRole()) && !"ADMIN".equals(requester.getRole())) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "This emergency is not assigned to your hospital");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        // Verify emergency is still pending hospital acceptance
        boolean isPending = "HOSPITAL_ASSIGNED".equals(request.getStatus())
                || "PENDING_HOSPITAL_ACCEPTANCE".equals(request.getStatus())
                || "NEXT_HOSPITAL_REQUESTED".equals(request.getStatus())
                || "DETECTED".equals(request.getStatus());

        if (!isPending) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Emergency is no longer pending hospital acceptance. Current status: " + request.getStatus());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(err);
        }

        try {
            Long targetHospitalId = requester.getHospitalId() != null ? requester.getHospitalId() : request.getHospitalId();
            EmergencyRequest acceptedRequest;
            if (workflowService != null) {
                acceptedRequest = workflowService.acceptHospitalEmergency(id, targetHospitalId);
            } else {
                acceptedRequest = emergencyService.acceptEmergency(id, targetHospitalId);
            }
            return ResponseEntity.ok(enrichEmergency(acceptedRequest));
        } catch (IllegalStateException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(err);
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> rejectCase(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!"HOSPITAL_ADMIN".equals(requester.getRole()) && !"SYSTEM_ADMIN".equals(requester.getRole()) && !"ADMIN".equals(requester.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital administrators can reject emergencies"));
        }

        if (requester.getHospitalId() == null && "HOSPITAL_ADMIN".equals(requester.getRole())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Hospital admin not linked to a hospital"));
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        if (requester.getHospitalId() != null && !requester.getHospitalId().equals(request.getHospitalId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "This emergency is not assigned to your hospital"));
        }

        String reason = null;
        if (body != null && body.containsKey("reason")) {
            reason = (String) body.get("reason");
        }

        try {
            Long hospId = requester.getHospitalId() != null ? requester.getHospitalId() : request.getHospitalId();
            EmergencyRequest updated;
            if (workflowService != null) {
                updated = workflowService.rejectHospitalEmergency(id, hospId, reason);
            } else {
                updated = emergencyService.rejectEmergency(id, hospId, reason);
            }
            return ResponseEntity.ok(enrichEmergency(updated));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping({"/{id}/ambulance-decision", "/{id}/decision"})
    public ResponseEntity<?> setAmbulanceDecision(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        EmergencyRequest req = reqOpt.get();

        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("DOCTOR".equals(role)) {
            if (req.getDoctorId() != null && (req.getDoctorId().equals(requester.getId()) || req.getDoctorId().equals(requester.getDoctorId()))) {
                isAuthorized = true;
            } else if (requester.getHospitalId() != null && requester.getHospitalId().equals(req.getHospitalId())) {
                isAuthorized = true;
            }
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to assess this emergency"));

        String decision = null;
        boolean requiresAmbulance = true;
        if (body.containsKey("decision")) {
            decision = body.get("decision").toString();
            requiresAmbulance = "REQUIRED".equalsIgnoreCase(decision);
        } else if (body.containsKey("requiresAmbulance")) {
            requiresAmbulance = Boolean.parseBoolean(body.get("requiresAmbulance").toString());
            decision = requiresAmbulance ? "REQUIRED" : "NOT_REQUIRED";
        }

        if (workflowService != null) {
            EmergencyRequest updated = (decision != null) 
                    ? workflowService.setAmbulanceDecision(id, decision)
                    : workflowService.setAmbulanceDecision(id, requiresAmbulance);
            return ResponseEntity.ok(enrichEmergency(updated));
        } else {
            req.setRequiresAmbulance(requiresAmbulance);
            req.setAmbulanceDecision(requiresAmbulance ? "REQUIRED" : "NOT_REQUIRED");
            req.setStatus(requiresAmbulance ? "AMBULANCE_REQUESTED" : "AMBULANCE_NOT_REQUIRED");
            emergencyRepository.save(req);
            return ResponseEntity.ok(enrichEmergency(req));
        }
    }

    @GetMapping("/active")
    public ResponseEntity<?> getActiveEmergencies() {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<EmergencyRequest> allActive = emergencyRepository.findByStatusIn(List.of(
                "CREATED", "SEARCHING_HOSPITAL", "DETECTED", "PENDING_HOSPITAL_ACCEPTANCE", "HOSPITAL_ASSIGNED", "ACCEPTED", "HOSPITAL_ACCEPTED",
                "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED", "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED",
                "AMBULANCE_DISPATCHED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP",
                "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "AMBULANCE_NOT_REQUIRED", "NEXT_HOSPITAL_REQUESTED",
                "PENDING_DRIVER_ACCEPTANCE", "DRIVER_ACCEPTED", "JOURNEY_STARTED", "ARRIVED_AT_PICKUP", "PATIENT_ONBOARD"
        )).stream()
                .filter(e -> !Boolean.TRUE.equals(e.getCancelled())
                        && !"RESOLVED".equalsIgnoreCase(e.getStatus())
                        && !"COMPLETED".equalsIgnoreCase(e.getStatus())
                        && !"CANCELLED".equalsIgnoreCase(e.getStatus()))
                .sorted((a, b) -> {
                    if (a.getCreatedAt() == null || b.getCreatedAt() == null) return 0;
                    return b.getCreatedAt().compareTo(a.getCreatedAt());
                })
                .toList();

        // Filter based on role
        List<EmergencyRequest> filtered;
        String role = requester.getRole();

        if ("PATIENT".equals(role)) {
            filtered = allActive.stream()
                    .filter(e -> requesterUid.equals(e.getPatientUid()))
                    .toList();
        } else if ("FAMILY_MEMBER".equals(role)) {
            if (relationshipRepository != null) {
                List<PatientFamilyRelationship> rels = relationshipRepository.findByFamilyUserIdAndActiveTrue(requester.getId());
                Set<String> patientUids = rels.stream()
                        .map(r -> r.getPatient() != null ? r.getPatient().getUid() : null)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());
                filtered = allActive.stream()
                        .filter(e -> patientUids.contains(e.getPatientUid()))
                        .toList();
            } else {
                filtered = List.of();
            }
        } else if ("DOCTOR".equals(role)) {
            Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();
            filtered = allActive.stream()
                    .filter(e -> e.getDoctorId() != null && (e.getDoctorId().equals(docProfileId) || e.getDoctorId().equals(requester.getId())))
                    .toList();
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            if (requester.getHospitalId() != null) {
                filtered = allActive.stream()
                        .filter(e -> requester.getHospitalId().equals(e.getHospitalId()))
                        .toList();
            } else {
                filtered = List.of();
            }
        } else if ("SYSTEM_ADMIN".equals(role)) {
            filtered = allActive;
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            // Get ambulances assigned to this driver
            filtered = allActive.stream()
                    .filter(e -> {
                        Long ambId = e.getAmbulanceId();
                        if (ambId == null) {
                            Optional<Ambulance> ambOpt = ambulanceRepository.findByCurrentEmergencyId(e.getId());
                            if (ambOpt.isPresent()) ambId = ambOpt.get().getId();
                        }
                        if (ambId == null) return false;
                        Optional<Ambulance> ambOpt = ambulanceRepository.findById(ambId);
                        return ambOpt.isPresent() && ambOpt.get().getDriver() != null
                                && ambOpt.get().getDriver().getId().equals(requester.getId());
                    })
                    .toList();
        } else {
            filtered = List.of();
        }

        return ResponseEntity.ok(filtered.stream().map(this::enrichEmergency).toList());
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<?> getTimeline(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization check (same as getEmergencyRequest)
        boolean isAuthorized = checkAuthorization(requester, request);
        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied"));
        }

        // Return real timeline events from repository
        if (eventRepository != null) {
            return ResponseEntity.ok(eventRepository.findByEmergencyIdOrderByTimestampAsc(id));
        }
        return ResponseEntity.ok(List.of());
    }

    @GetMapping("/{id}/hospital")
    public ResponseEntity<?> getAssignedHospital(@PathVariable Long id) {
        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null || request.getHospitalId() == null) {
            return ResponseEntity.notFound().build();
        }
        return hospitalRepository.findById(request.getHospitalId())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/doctor")
    public ResponseEntity<?> getAssignedDoctor(@PathVariable Long id) {
        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null || request.getDoctorId() == null || request.getDoctorId() <= 0) {
            return ResponseEntity.notFound().build();
        }
        return doctorRepository.findById(request.getDoctorId())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/ambulance")
    public ResponseEntity<?> getAssignedAmbulance(@PathVariable Long id) {
        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null || request.getAmbulanceId() == null) {
            return ResponseEntity.notFound().build();
        }
        return ambulanceRepository.findById(request.getAmbulanceId())
                .map(amb -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", amb.getId());
                    map.put("unitId", amb.getUnitId());
                    map.put("status", amb.getStatus());
                    map.put("latitude", amb.getLatitude());
                    map.put("longitude", amb.getLongitude());
                    map.put("hospitalName", amb.getHospitalName());
                    map.put("currentEmergencyId", amb.getCurrentEmergencyId());
                    map.put("vehicleType", "Type-D Advanced Cardiac Life Support (ACLS)");
                    map.put("vehicleRegistration", "KA-01-EQ-" + (1000 + (amb.getId() != null ? (amb.getId() * 117) % 9000 : 9042)));
                    map.put("equipment", List.of("12-Lead ECG Monitor", "Defibrillator", "Portable Ventilator", "Emergency Resuscitation Kit"));
                    if (amb.getDriver() != null) {
                        map.put("driverName", amb.getDriver().getFullName());
                        map.put("driverPhone", amb.getDriver().getDoctorPhone() != null ? amb.getDriver().getDoctorPhone() : "9876543210");
                        map.put("driverRating", 4.9);
                    } else {
                        map.put("driverName", "Officer Rajiv");
                        map.put("driverPhone", "9876543210");
                        map.put("driverRating", 4.9);
                    }
                    return ResponseEntity.ok(map);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveCase(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization: Only assigned doctor, hospital admin for their hospital, or system admin can resolve
        boolean isAuthorized = false;
        String role = requester.getRole();
        Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();
        if ("DOCTOR".equals(role) && request.getDoctorId() != null && 
                (request.getDoctorId().equals(docProfileId) || request.getDoctorId().equals(requester.getId()))) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null
                && requester.getHospitalId().equals(request.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to resolve this emergency"));
        }

        // Reject duplicate resolution attempts
        if ("RESOLVED".equalsIgnoreCase(request.getStatus()) || "COMPLETED".equalsIgnoreCase(request.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Emergency is already resolved"));
        }

        if (workflowService != null) {
            workflowService.resolveEmergency(id);
        } else {
            request.setStatus("RESOLVED");
            request.setCompletedAt(java.time.LocalDateTime.now());
            emergencyRepository.save(request);

            // Update hospital resources if needed
            Hospital hospital = hospitalRepository.findById(request.getHospitalId()).orElse(null);
            if (hospital != null) {
                hospital.setAvailableBeds(Math.min(hospital.getTotalBeds(), hospital.getAvailableBeds() + 1));
                hospital.setAvailableDoctors(Math.min(hospital.getTotalDoctors(), hospital.getAvailableDoctors() + 1));
                hospitalRepository.save(hospital);
            }

        // Release doctor
        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            doctorRepository.findById(request.getDoctorId()).ifPresent(doc -> {
                doc.setAvailableForEmergency(true);
                doctorRepository.save(doc);
            });
        }

        // Release ambulance
        if (request.getAmbulanceId() != null) {
            ambulanceRepository.findById(request.getAmbulanceId()).ifPresent(amb -> {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            });
        }
        for (Ambulance amb : ambulanceRepository.findByStatusIn(List.of("REQUESTED", "ACCEPTED"))) {
            if (id.equals(amb.getCurrentEmergencyId())) {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            }
        }

            // Complete any pending/accepted ambulance requests for this emergency
            if (ambulanceRequestRepository != null) {
                for (AmbulanceRequest ar : ambulanceRequestRepository.findByEmergencyIdAndStatusIn(id, List.of("PENDING", "ACCEPTED"))) {
                    ar.setStatus("COMPLETED");
                    ambulanceRequestRepository.save(ar);
                }
            }

            if (eventRepository != null) {
                eventRepository.save(new EmergencyEvent(id, "RESOLVED", "Emergency resolved successfully. Resources released."));
            }
        }

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("sos_id", id);
        res.put("status", "resolved");
        return ResponseEntity.ok(res);
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancelCase(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization: Patient can cancel their own, hospital admin for their hospital, system admin
        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("PATIENT".equals(role) && requesterUid.equals(request.getPatientUid())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null
                && requester.getHospitalId().equals(request.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to cancel this emergency"));
        }

        request.setStatus("CANCELLED");
        request.setCancelled(true);
        request.setCompletedAt(java.time.LocalDateTime.now());
        emergencyRepository.save(request);

        // Release resources
        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            doctorRepository.findById(request.getDoctorId()).ifPresent(doc -> {
                doc.setAvailableForEmergency(true);
                doctorRepository.save(doc);
            });
        }

        if (request.getAmbulanceId() != null) {
            ambulanceRepository.findById(request.getAmbulanceId()).ifPresent(amb -> {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            });
        }
        for (Ambulance amb : ambulanceRepository.findByStatusIn(List.of("REQUESTED", "ACCEPTED"))) {
            if (id.equals(amb.getCurrentEmergencyId())) {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            }
        }

        // Cancel any pending/accepted ambulance requests for this emergency
        if (ambulanceRequestRepository != null) {
            for (AmbulanceRequest ar : ambulanceRequestRepository.findByEmergencyIdAndStatusIn(id, List.of("PENDING", "ACCEPTED"))) {
                ar.setStatus("CANCELLED");
                ambulanceRequestRepository.save(ar);
            }
        }

        if (request.getHospitalId() != null) {
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                hospitalRepository.save(h);
            });
        }

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("sos_id", id);
        res.put("status", "cancelled");
        return ResponseEntity.ok(res);
    }

    private Map<String, Object> enrichEmergency(EmergencyRequest request) {
        Map<String, Object> enriched = new HashMap<>();

        // Basic fields
        enriched.put("id", request.getId());
        enriched.put("patientUid", request.getPatientUid());
        enriched.put("latitude", request.getLatitude());
        enriched.put("longitude", request.getLongitude());
        enriched.put("symptoms", request.getSymptoms());
        enriched.put("symptomDescription", request.getSymptomDescription());
        enriched.put("requiredDepartment", request.getRequiredDepartment());
        enriched.put("hospitalId", request.getHospitalId());
        enriched.put("doctorId", request.getDoctorId());
        enriched.put("ambulanceId", request.getAmbulanceId());
        enriched.put("status", request.getStatus());
        enriched.put("createdAt", request.getCreatedAt());
        enriched.put("acceptedAt", request.getAcceptedAt());
        enriched.put("assignedAt", request.getAssignedAt());
        enriched.put("completedAt", request.getCompletedAt());
        enriched.put("cancelled", request.getCancelled());
        enriched.put("smsSent", request.getSmsSent());
        enriched.put("ambulanceDispatched", request.getAmbulanceDispatched());
        enriched.put("requiresAmbulance", request.getRequiresAmbulance());
        enriched.put("riskScore", request.getRiskScore());
        enriched.put("severity", request.getSeverity());
        enriched.put("detectedVitals", request.getDetectedVitals());

        // Enrich with hospital name
        if (request.getHospitalId() != null) {
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                enriched.put("hospitalName", h.getName());
                enriched.put("hospitalLat", h.getLat());
                enriched.put("hospitalLng", h.getLng());
            });
        }

        // Enrich with doctor name
        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            doctorRepository.findById(request.getDoctorId()).ifPresent(d -> {
                enriched.put("doctorName", d.getName());
                enriched.put("doctorSpecialization", d.getSpecialization());
                enriched.put("doctorPhone", d.getPhone());
            });
        } else if (request.getDoctorId() != null && request.getDoctorId() == -1L) {
            enriched.put("doctorName", "Emergency Team");
        }

        // Enrich with ambulance info
        Long ambId = request.getAmbulanceId();
        if (ambId == null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findByCurrentEmergencyId(request.getId());
            if (ambOpt.isPresent()) {
                ambId = ambOpt.get().getId();
                enriched.put("ambulanceId", ambId);
            }
        }
        if (ambId != null) {
            ambulanceRepository.findById(ambId).ifPresent(a -> {
                enriched.put("ambulanceUnitId", a.getUnitId());
                enriched.put("ambulanceStatus", a.getStatus());
                enriched.put("ambulanceLatitude", a.getLatitude());
                enriched.put("ambulanceLongitude", a.getLongitude());
                if (a.getDriver() != null) {
                    enriched.put("driverName", a.getDriver().getFullName());
                }
            });
        }

        // Enrich with patient info
        userRepository.findByUid(request.getPatientUid()).ifPresent(p -> {
            String contactPhone = p.getDoctorPhone() != null ? p.getDoctorPhone() : p.getPhone();
            enriched.put("patientName", p.getFullName());
            enriched.put("patientAge", p.getAge());
            enriched.put("patientBloodGroup", p.getBloodGroup());
            enriched.put("patientPhone", contactPhone);
            enriched.put("patientAddress", p.getAddress());
            enriched.put("patientEmergencyContact", contactPhone);

            Map<String, Object> patientMap = new HashMap<>();
            patientMap.put("fullName", p.getFullName());
            patientMap.put("uid", p.getUid());
            patientMap.put("age", p.getAge());
            patientMap.put("bloodGroup", p.getBloodGroup());
            patientMap.put("phone", contactPhone);
            patientMap.put("emergencyContact", contactPhone);
            patientMap.put("address", p.getAddress());
            enriched.put("patient", patientMap);
        });

        return enriched;
    }

    private boolean checkAuthorization(User requester, EmergencyRequest request) {
        String role = requester.getRole();
        String requesterUid = requester.getUid();

        if (requesterUid.equals(request.getPatientUid())) {
            return true;
        } else if ("FAMILY_MEMBER".equals(role)) {
            User patient = userRepository.findByUid(request.getPatientUid()).orElse(null);
            return patient != null && relationshipRepository != null && relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), requester.getId());
        } else if ("DOCTOR".equals(role)) {
            Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();
            return request.getDoctorId() != null && request.getDoctorId() > 0 && 
                    (request.getDoctorId().equals(docProfileId) || request.getDoctorId().equals(requester.getId()));
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            return requester.getHospitalId() != null && requester.getHospitalId().equals(request.getHospitalId());
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            Long ambId = request.getAmbulanceId();
            if (ambId == null) {
                Optional<Ambulance> ambOpt = ambulanceRepository.findByCurrentEmergencyId(request.getId());
                if (ambOpt.isPresent()) ambId = ambOpt.get().getId();
            }
            return ambId != null && requester.getAmbulanceId() != null
                    && requester.getAmbulanceId().equals(ambId);
        } else if ("SYSTEM_ADMIN".equals(role)) {
            return true;
        }
        return false;
    }
}