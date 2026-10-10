package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping({"/api/ambulance", "/api/ambulances"})
public class AmbulanceController {

    private final AmbulanceService ambulanceService;
    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceRequestRepository requestRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;
    private final com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository relationshipRepository;
    private final com.vitaguard.backend_java.hospital.HospitalRepository hospitalRepository;

    public AmbulanceController(AmbulanceService ambulanceService,
                               AmbulanceRepository ambulanceRepository,
                               AmbulanceRequestRepository requestRepository,
                               EmergencyRequestRepository emergencyRepository,
                               UserRepository userRepository) {
        this(ambulanceService, ambulanceRepository, requestRepository, emergencyRepository, userRepository, null, null);
    }

    public AmbulanceController(AmbulanceService ambulanceService,
                               AmbulanceRepository ambulanceRepository,
                               AmbulanceRequestRepository requestRepository,
                               EmergencyRequestRepository emergencyRepository,
                               UserRepository userRepository,
                               com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository relationshipRepository) {
        this(ambulanceService, ambulanceRepository, requestRepository, emergencyRepository, userRepository, relationshipRepository, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AmbulanceController(AmbulanceService ambulanceService,
                               AmbulanceRepository ambulanceRepository,
                               AmbulanceRequestRepository requestRepository,
                               EmergencyRequestRepository emergencyRepository,
                               UserRepository userRepository,
                               com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository relationshipRepository,
                               com.vitaguard.backend_java.hospital.HospitalRepository hospitalRepository) {
        this.ambulanceService = ambulanceService;
        this.ambulanceRepository = ambulanceRepository;
        this.requestRepository = requestRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
        this.relationshipRepository = relationshipRepository;
        this.hospitalRepository = hospitalRepository;
    }

    @GetMapping
    public ResponseEntity<List<Ambulance>> getAllAmbulances() {
        return ResponseEntity.ok(ambulanceRepository.findAll());
    }

    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<?> getAmbulanceById(@PathVariable Long id) {
        return ambulanceRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/current-job")
    public ResponseEntity<?> getCurrentJob() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can access this endpoint"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty() && driver.getAmbulanceId() != null) {
            ambulanceOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("ambulance", ambulance);
        
        if (ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> response.put("emergency", e));
        }

        return ResponseEntity.ok(response);
    }

    @GetMapping("/pending-requests")
    public ResponseEntity<?> getPendingRequests() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can access this endpoint"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        List<AmbulanceRequest> requests = ambulanceService.getPendingRequests(driver.getId());
        List<Map<String, Object>> enriched = requests.stream().map(req -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", req.getId());
            map.put("requestId", req.getId());
            map.put("emergencyId", req.getEmergencyId());
            map.put("ambulanceId", req.getAmbulanceId());
            map.put("status", req.getStatus());
            map.put("requestedAt", req.getRequestedAt());
            map.put("distanceKm", req.getDistanceKm());
            map.put("etaMinutes", req.getEtaMinutes());

            emergencyRepository.findById(req.getEmergencyId()).ifPresent(e -> {
                map.put("patientUid", e.getPatientUid());
                map.put("pickupLat", e.getLatitude());
                map.put("pickupLng", e.getLongitude());
                map.put("symptoms", e.getSymptoms());
                map.put("severity", e.getSeverity());
                map.put("riskScore", e.getRiskScore());
                map.put("hospitalId", e.getHospitalId());

                userRepository.findByUid(e.getPatientUid()).ifPresent(p -> {
                    map.put("patientName", p.getFullName());
                    map.put("patientAge", p.getAge());
                    map.put("patientBloodGroup", p.getBloodGroup());
                    map.put("patientPhone", p.getDoctorPhone());
                    map.put("patientAddress", p.getAddress());
                });

                if (e.getHospitalId() != null && hospitalRepository != null) {
                    hospitalRepository.findById(e.getHospitalId()).ifPresent(h -> {
                        map.put("destinationHospital", h.getName());
                        map.put("hospitalName", h.getName());
                    });
                }
            });
            return map;
        }).toList();

        return ResponseEntity.ok(enriched);
    }

    @PostMapping("/requests/{requestId}/accept")
    public ResponseEntity<?> acceptRequest(@PathVariable Long requestId) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can accept requests"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        boolean accepted = ambulanceService.acceptRequest(requestId, driver.getId());
        if (accepted) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Request accepted"));
        } else {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Request no longer available or already accepted by another driver"));
        }
    }

    @PostMapping("/requests/{requestId}/decline")
    public ResponseEntity<?> declineRequest(@PathVariable Long requestId) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can decline requests"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        boolean declined = ambulanceService.declineRequest(requestId, driver.getId());
        if (declined) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Request declined"));
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot decline request"));
        }
    }

    @PostMapping("/status")
    public ResponseEntity<?> updateStatus(@RequestBody Map<String, Object> body) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can update status"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty() && driver.getAmbulanceId() != null) {
            ambulanceOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();
        String status = (String) body.get("status");
        Double lat = body.containsKey("latitude") ? Double.valueOf(body.get("latitude").toString()) : null;
        Double lng = body.containsKey("longitude") ? Double.valueOf(body.get("longitude").toString()) : null;

        // Validate status transition
        if (!isValidStatusTransition(ambulance.getStatus(), status)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status transition from " + ambulance.getStatus() + " to " + status));
        }

        ambulanceService.updateAmbulanceStatus(ambulance.getId(), status, lat, lng);

        // If status is PATIENT_PICKED_UP, update emergency
        if ("PATIENT_PICKED_UP".equals(status) && ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> {
                e.setStatus("PATIENT_PICKED_UP");
                emergencyRepository.save(e);
            });
        }

        // If status is ARRIVED_AT_HOSPITAL, update emergency
        if ("ARRIVED_AT_HOSPITAL".equals(status) && ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> {
                e.setStatus("ARRIVED_AT_HOSPITAL");
                emergencyRepository.save(e);
            });
        }

        return ResponseEntity.ok(Map.of("success", true, "status", status));
    }

    @PostMapping("/location")
    public ResponseEntity<?> updateLocation(@RequestBody Map<String, Object> body) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can update location"));
        }

        if (driver.getAmbulanceId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Ambulance driver not linked to an ambulance"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty() && driver.getAmbulanceId() != null) {
            ambulanceOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();

        // Only allow location updates when ambulance has an active emergency
        if (ambulance.getCurrentEmergencyId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No active emergency for this ambulance"));
        }

        Double lat = body.containsKey("latitude") ? Double.valueOf(body.get("latitude").toString()) : null;
        Double lng = body.containsKey("longitude") ? Double.valueOf(body.get("longitude").toString()) : null;

        if (lat == null || lng == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Latitude and longitude are required"));
        }

        // Update location without changing status
        ambulance.setLatitude(lat);
        ambulance.setLongitude(lng);
        ambulanceRepository.save(ambulance);

        // Broadcast location update via WebSocket
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("ambulanceId", ambulance.getId());
        payload.put("unitId", ambulance.getUnitId());
        payload.put("status", ambulance.getStatus());
        payload.put("latitude", lat);
        payload.put("longitude", lng);
        payload.put("timestamp", java.time.LocalDateTime.now().toString());
        payload.put("emergencyId", ambulance.getCurrentEmergencyId());

        // The AmbulanceService will broadcast this
        ambulanceService.updateAmbulanceStatus(ambulance.getId(), ambulance.getStatus(), lat, lng);

        return ResponseEntity.ok(Map.of("success", true, "latitude", lat, "longitude", lng));
    }

    private boolean isValidStatusTransition(String currentStatus, String newStatus) {
        if (currentStatus == null || newStatus == null) return false;
        
        Map<String, List<String>> validTransitions = Map.of(
            "AVAILABLE", List.of("REQUESTED"),
            "REQUESTED", List.of("ACCEPTED", "DECLINED", "AVAILABLE"),
            "ACCEPTED", List.of("EN_ROUTE_TO_PATIENT"),
            "EN_ROUTE_TO_PATIENT", List.of("ARRIVED_AT_PATIENT"),
            "ARRIVED_AT_PATIENT", List.of("PATIENT_PICKED_UP"),
            "PATIENT_PICKED_UP", List.of("EN_ROUTE_TO_HOSPITAL"),
            "EN_ROUTE_TO_HOSPITAL", List.of("ARRIVED_AT_HOSPITAL"),
            "ARRIVED_AT_HOSPITAL", List.of("COMPLETED"),
            "COMPLETED", List.of("AVAILABLE")
        );

        List<String> allowed = validTransitions.get(currentStatus);
        return allowed != null && allowed.contains(newStatus);
    }

    @GetMapping("/{ambulanceId}/location")
    public ResponseEntity<?> getAmbulanceLocation(@PathVariable Long ambulanceId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByUid(currentUid).orElse(null);

        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findById(ambulanceId);
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Ambulance ambulance = ambulanceOpt.get();

        // Authorization: driver can see own, hospital admin can see their hospital's, system admin can see all
        boolean authorized = "AMBULANCE_DRIVER".equals(currentUser.getRole()) && (
                (ambulance.getDriver() != null && ambulance.getDriver().getId().equals(currentUser.getId()))
                || (currentUser.getAmbulanceId() != null && currentUser.getAmbulanceId().equals(ambulance.getId()))
        )
                || "HOSPITAL_ADMIN".equals(currentUser.getRole()) && ambulance.getCurrentEmergencyId() != null
                || "SYSTEM_ADMIN".equals(currentUser.getRole())
                || "DOCTOR".equals(currentUser.getRole()) && ambulance.getCurrentEmergencyId() != null;

        if (!authorized && ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            if (reqOpt.isPresent()) {
                EmergencyRequest req = reqOpt.get();
                if ("PATIENT".equals(currentUser.getRole()) && currentUser.getUid().equals(req.getPatientUid())) {
                    authorized = true;
                } else if ("FAMILY_MEMBER".equals(currentUser.getRole()) && relationshipRepository != null) {
                    User patient = userRepository.findByUid(req.getPatientUid()).orElse(null);
                    if (patient != null) {
                        authorized = relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), currentUser.getId());
                    }
                }
            }
        }

        if (!authorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to view ambulance location"));
        }

        Map<String, Object> response = new HashMap<>();
        response.put("ambulanceId", ambulance.getId());
        response.put("unitId", ambulance.getUnitId());
        response.put("latitude", ambulance.getLatitude());
        response.put("longitude", ambulance.getLongitude());
        response.put("status", ambulance.getStatus());
        return ResponseEntity.ok(response);
    }
}