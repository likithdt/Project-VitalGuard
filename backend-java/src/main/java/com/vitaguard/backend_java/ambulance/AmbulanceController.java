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

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.vitaguard.backend_java.emergency.EmergencyService emergencyService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.springframework.messaging.simp.SimpMessagingTemplate messagingTemplate;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private AmbulanceLocationLogRepository locationLogRepository;

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
        if (ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> erOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            if (erOpt.isEmpty() || Boolean.TRUE.equals(erOpt.get().getCancelled())
                    || "RESOLVED".equals(erOpt.get().getStatus())
                    || "CANCELLED".equals(erOpt.get().getStatus())
                    || "COMPLETED".equals(erOpt.get().getStatus())) {
                ambulance.setCurrentEmergencyId(null);
                if (!"REQUESTED".equals(ambulance.getStatus())) {
                    ambulance.setStatus("AVAILABLE");
                }
                ambulanceRepository.save(ambulance);
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("ambulance", ambulance);
        
        if (ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            if (emergencyOpt.isPresent()) {
                EmergencyRequest e = emergencyOpt.get();
                Map<String, Object> enriched = new HashMap<>();
                enriched.put("id", e.getId());
                enriched.put("emergencyId", e.getId());
                enriched.put("patientUid", e.getPatientUid());
                enriched.put("severity", e.getSeverity());
                enriched.put("riskScore", e.getRiskScore());
                enriched.put("status", e.getStatus());
                enriched.put("latitude", e.getLatitude());
                enriched.put("longitude", e.getLongitude());
                enriched.put("pickupAddress", e.getPickupAddress());
                enriched.put("symptoms", e.getSymptoms());
                enriched.put("symptomDescription", e.getSymptomDescription());
                enriched.put("emergencyType", e.getEmergencyType());
                enriched.put("hospitalId", e.getHospitalId());
                enriched.put("ambulanceId", ambulance.getId());
                enriched.put("ambulanceUnitId", ambulance.getUnitId());
                enriched.put("driverName", driver.getFullName());

                userRepository.findByUid(e.getPatientUid()).ifPresent(p -> {
                    enriched.put("patientName", p.getFullName());
                    enriched.put("patientAge", p.getAge());
                    enriched.put("patientBloodGroup", p.getBloodGroup());
                    enriched.put("patientPhone", p.getDoctorPhone() != null ? p.getDoctorPhone() : p.getPhone());
                    if (e.getPickupAddress() == null || e.getPickupAddress().isEmpty()) {
                        enriched.put("pickupAddress", p.getAddress());
                    }
                });

                if (e.getHospitalId() != null && hospitalRepository != null) {
                    hospitalRepository.findById(e.getHospitalId()).ifPresent(h -> {
                        enriched.put("hospitalName", h.getName());
                        enriched.put("destinationHospital", h.getName());
                        enriched.put("hospitalLat", h.getLat());
                        enriched.put("hospitalLng", h.getLng());
                    });
                }
                response.put("emergency", enriched);
            }
        }

        return ResponseEntity.ok(response);
    }

    @PostMapping("/request")
    public ResponseEntity<?> createAmbulanceRequest(@RequestBody Map<String, Object> body) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);
        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
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
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to request ambulance for this patient"));
        }

        String emergencyType = (String) body.getOrDefault("emergencyType", body.getOrDefault("emergency_type", "Medical Emergency"));
        String description = (String) body.getOrDefault("description", "Ambulance requested by " + requester.getFullName());
        String symptoms = (String) body.getOrDefault("symptoms", emergencyType);
        String pickupAddress = (String) body.getOrDefault("pickupAddress", body.getOrDefault("pickup_address", body.getOrDefault("address", "")));

        Double lat = 12.9716;
        Double lng = 77.5946;
        if (body.containsKey("location")) {
            Map<String, Object> loc = (Map<String, Object>) body.get("location");
            if (loc != null) {
                lat = ((Number) loc.getOrDefault("lat", 12.9716)).doubleValue();
                lng = ((Number) loc.getOrDefault("lng", 77.5946)).doubleValue();
            }
        } else {
            if (body.containsKey("lat")) lat = ((Number) body.get("lat")).doubleValue();
            else if (body.containsKey("latitude")) lat = ((Number) body.get("latitude")).doubleValue();
            if (body.containsKey("lng")) lng = ((Number) body.get("lng")).doubleValue();
            else if (body.containsKey("longitude")) lng = ((Number) body.get("longitude")).doubleValue();
        }

        Long hospitalId = null;
        if (body.containsKey("hospitalId")) {
            hospitalId = ((Number) body.get("hospitalId")).longValue();
        } else if (body.containsKey("destinationHospitalId")) {
            hospitalId = ((Number) body.get("destinationHospitalId")).longValue();
        }

        EmergencyRequest emergency;
        if (emergencyService != null) {
            emergency = emergencyService.triggerSos(targetPatientUid, lat, lng, symptoms, description, true);
        } else {
            emergency = new EmergencyRequest(targetPatientUid, lat, lng, symptoms, description);
            emergency.setRequiresAmbulance(true);
            emergency.setStatus("AMBULANCE_REQUESTED");
            emergencyRepository.save(emergency);
        }

        emergency.setPickupAddress(pickupAddress);
        emergency.setEmergencyType(emergencyType);
        if (!requesterUid.equals(targetPatientUid)) {
            emergency.setGuardianUid(requesterUid);
        }
        if (hospitalId != null) {
            emergency.setHospitalId(hospitalId);
        }
        emergencyRepository.save(emergency);

        AmbulanceRequest ambReq = ambulanceService.requestNearestAmbulance(emergency);

        Map<String, Object> response = new HashMap<>();
        response.put("emergencyId", emergency.getId());
        response.put("requestId", ambReq != null ? ambReq.getId() : emergency.getId());
        response.put("patientUid", emergency.getPatientUid());
        response.put("guardianUid", emergency.getGuardianUid());
        response.put("emergencyType", emergency.getEmergencyType());
        response.put("description", emergency.getSymptomDescription());
        response.put("pickupAddress", emergency.getPickupAddress());
        response.put("latitude", emergency.getLatitude());
        response.put("longitude", emergency.getLongitude());
        response.put("destinationHospitalId", emergency.getHospitalId());
        response.put("createdAt", emergency.getCreatedAt());
        response.put("status", emergency.getStatus());

        if (ambReq != null) {
            response.put("ambulanceId", ambReq.getAmbulanceId());
            response.put("distanceKm", ambReq.getDistanceKm());
            response.put("etaMinutes", ambReq.getEtaMinutes());
            ambulanceRepository.findById(ambReq.getAmbulanceId()).ifPresent(amb -> {
                response.put("ambulanceUnitId", amb.getUnitId());
                if (amb.getDriver() != null) {
                    response.put("driverName", amb.getDriver().getFullName());
                }
            });
        }

        if (messagingTemplate != null) {
            messagingTemplate.convertAndSend("/topic/ambulance/requests", (Object) response);
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

        Optional<Ambulance> driverAmbOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (driverAmbOpt.isEmpty() && driver.getAmbulanceId() != null) {
            driverAmbOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        final Ambulance driverAmb = driverAmbOpt.orElse(null);

        List<AmbulanceRequest> requests = ambulanceService.getPendingRequests(driver.getId());
        List<Map<String, Object>> enriched = requests.stream().map(req -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", req.getId());
            map.put("requestId", req.getId());
            map.put("emergencyId", req.getEmergencyId());
            map.put("ambulanceId", req.getAmbulanceId());
            map.put("status", req.getStatus());
            map.put("requestedAt", req.getRequestedAt());

            emergencyRepository.findById(req.getEmergencyId()).ifPresent(e -> {
                map.put("patientUid", e.getPatientUid());
                map.put("guardianUid", e.getGuardianUid());
                map.put("pickupAddress", e.getPickupAddress());
                map.put("pickupLat", e.getLatitude());
                map.put("pickupLng", e.getLongitude());
                map.put("symptoms", e.getSymptoms());
                map.put("symptomDescription", e.getSymptomDescription());
                map.put("emergencyType", e.getEmergencyType() != null ? e.getEmergencyType() : "Medical Emergency");
                map.put("severity", e.getSeverity() != null ? e.getSeverity() : "CRITICAL");
                map.put("riskScore", e.getRiskScore() != null ? e.getRiskScore() : 85);
                map.put("hospitalId", e.getHospitalId());

                // Calculate distance relative to THIS driver's ambulance or request coordinates
                Double calculatedDist = null;
                Integer calculatedEta = null;
                if (driverAmb != null && driverAmb.getLatitude() != null && driverAmb.getLongitude() != null
                        && e.getLatitude() != null && e.getLongitude() != null) {
                    double dist = calculateDistance(driverAmb.getLatitude(), driverAmb.getLongitude(),
                            e.getLatitude(), e.getLongitude());
                    if (dist <= 60.0) {
                        calculatedDist = Math.round(dist * 100.0) / 100.0;
                        calculatedEta = Math.max(1, (int) Math.ceil((dist / 40.0) * 60.0));
                    }
                }

                if (calculatedDist == null && req.getDistanceKm() != null && req.getDistanceKm() <= 60.0) {
                    calculatedDist = Math.round(req.getDistanceKm() * 100.0) / 100.0;
                    calculatedEta = req.getEtaMinutes() != null ? req.getEtaMinutes() : Math.max(1, (int) Math.ceil((req.getDistanceKm() / 40.0) * 60.0));
                }

                map.put("distanceKm", calculatedDist);
                map.put("etaMinutes", calculatedEta);

                userRepository.findByUid(e.getPatientUid()).ifPresent(p -> {
                    map.put("patientName", p.getFullName());
                    map.put("patientAge", p.getAge());
                    map.put("patientBloodGroup", p.getBloodGroup());
                    map.put("patientPhone", p.getDoctorPhone() != null ? p.getDoctorPhone() : p.getPhone());
                    if (e.getPickupAddress() == null || e.getPickupAddress().isEmpty()) {
                        map.put("pickupAddress", p.getAddress());
                    }
                    map.put("patientAddress", p.getAddress());
                });

                if (e.getHospitalId() != null && hospitalRepository != null) {
                    hospitalRepository.findById(e.getHospitalId()).ifPresent(h -> {
                        map.put("destinationHospital", h.getName());
                        map.put("hospitalName", h.getName());
                        map.put("hospitalLat", h.getLat());
                        map.put("hospitalLng", h.getLng());
                        if (h.getLat() != null && h.getLng() != null && e.getLatitude() != null && e.getLongitude() != null) {
                            double hDist = calculateDistance(e.getLatitude(), e.getLongitude(), h.getLat(), h.getLng());
                            if (hDist <= 60.0) {
                                map.put("pickupToHospitalDistanceKm", Math.round(hDist * 100.0) / 100.0);
                                map.put("pickupToHospitalEtaMinutes", Math.max(1, (int) Math.ceil((hDist / 40.0) * 60.0)));
                            }
                        }
                    });
                }
            });
            return map;
        }).toList();

        return ResponseEntity.ok(enriched);
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
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
            Optional<Ambulance> ambOpt = ambulanceRepository.findByDriverId(driver.getId());
            if (ambOpt.isEmpty() && driver.getAmbulanceId() != null) {
                ambOpt = ambulanceRepository.findById(driver.getAmbulanceId());
            }
            Long ambId = ambOpt.map(Ambulance::getId).orElse(driver.getAmbulanceId());
            String unitId = ambOpt.map(Ambulance::getUnitId).orElse("AMB-01");
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Request accepted",
                "status", "DRIVER_ACCEPTED",
                "requestId", requestId,
                "ambulanceId", ambId,
                "ambulanceUnitId", unitId
            ));
        } else {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Request no longer available or already accepted by another driver"));
        }
    }

    @PostMapping({"/requests/{requestId}/decline", "/requests/{requestId}/reject"})
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
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Request declined",
                "requestId", requestId,
                "status", "DECLINED"
            ));
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

        Double lat = body.get("latitude") != null ? Double.valueOf(body.get("latitude").toString()) : (body.get("lat") != null ? Double.valueOf(body.get("lat").toString()) : null);
        Double lng = body.get("longitude") != null ? Double.valueOf(body.get("longitude").toString()) : (body.get("lng") != null ? Double.valueOf(body.get("lng").toString()) : null);
        Double heading = body.get("heading") != null ? Double.valueOf(body.get("heading").toString()) : null;
        Double speed = body.get("speed") != null ? Double.valueOf(body.get("speed").toString()) : null;

        if (lat == null || lng == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Latitude and longitude are required"));
        }

        // Filter out GPS coordinates outside operational service boundary (> 60 km from central city)
        double distFromCenter = calculateDistance(12.9716, 77.5946, lat, lng);
        if (distFromCenter > 60.0) {
            return ResponseEntity.ok(Map.of(
                "warning", "Location outside operational service boundary; ambulance coordinates retained",
                "latitude", ambulance.getLatitude() != null ? ambulance.getLatitude() : 12.8958,
                "longitude", ambulance.getLongitude() != null ? ambulance.getLongitude() : 77.5989
            ));
        }

        // Update location without changing status
        ambulance.setLatitude(lat);
        ambulance.setLongitude(lng);
        ambulanceRepository.save(ambulance);

        // Persist GPS history log
        if (locationLogRepository != null) {
            try {
                AmbulanceLocationLog log = new AmbulanceLocationLog(
                    ambulance.getId(),
                    ambulance.getCurrentEmergencyId(),
                    lat,
                    lng,
                    heading,
                    speed
                );
                locationLogRepository.save(log);
            } catch (Exception ex) {
                // Log and continue
            }
        }

        // Broadcast location update via WebSocket
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("ambulanceId", ambulance.getId());
        payload.put("unitId", ambulance.getUnitId());
        payload.put("status", ambulance.getStatus());
        payload.put("latitude", lat);
        payload.put("longitude", lng);
        payload.put("heading", heading);
        payload.put("speed", speed);
        payload.put("timestamp", java.time.LocalDateTime.now().toString());
        payload.put("emergencyId", ambulance.getCurrentEmergencyId());

        // The AmbulanceService will broadcast this
        ambulanceService.updateAmbulanceStatus(ambulance.getId(), ambulance.getStatus(), lat, lng);

        return ResponseEntity.ok(Map.of("success", true, "latitude", lat, "longitude", lng));
    }

    @PostMapping("/start-journey")
    public ResponseEntity<?> startJourney(@RequestBody(required = false) Map<String, Object> body) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can start journey"));
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
        if (ambulance.getCurrentEmergencyId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No active emergency dispatch assigned to this ambulance"));
        }

        Double lat = null;
        Double lng = null;
        if (body != null) {
            if (body.get("latitude") != null) lat = Double.valueOf(body.get("latitude").toString());
            else if (body.get("lat") != null) lat = Double.valueOf(body.get("lat").toString());
            if (body.get("longitude") != null) lng = Double.valueOf(body.get("longitude").toString());
            else if (body.get("lng") != null) lng = Double.valueOf(body.get("lng").toString());
        }

        // Advance status to EN_ROUTE_TO_PATIENT
        ambulanceService.updateAmbulanceStatus(ambulance.getId(), "EN_ROUTE_TO_PATIENT", lat, lng);

        return ResponseEntity.ok(Map.of(
            "success", true,
            "status", "EN_ROUTE_TO_PATIENT",
            "emergencyId", ambulance.getCurrentEmergencyId(),
            "ambulanceId", ambulance.getId(),
            "ambulanceUnitId", ambulance.getUnitId()
        ));
    }

    @PostMapping({"/complete-journey", "/complete"})
    public ResponseEntity<?> completeJourney() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can complete journey"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty() && driver.getAmbulanceId() != null) {
            ambulanceOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();
        ambulanceService.updateAmbulanceStatus(ambulance.getId(), "COMPLETED", null, null);

        return ResponseEntity.ok(Map.of("success", true, "status", "COMPLETED"));
    }

    @GetMapping("/location")
    public ResponseEntity<?> getMyAmbulanceLocation() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can access this endpoint"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty() && driver.getAmbulanceId() != null) {
            ambulanceOpt = ambulanceRepository.findById(driver.getAmbulanceId());
        }
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Ambulance ambulance = ambulanceOpt.get();
        Map<String, Object> res = new HashMap<>();
        res.put("ambulanceId", ambulance.getId());
        res.put("unitId", ambulance.getUnitId());
        res.put("latitude", ambulance.getLatitude());
        res.put("longitude", ambulance.getLongitude());
        res.put("status", ambulance.getStatus());
        res.put("currentEmergencyId", ambulance.getCurrentEmergencyId());
        return ResponseEntity.ok(res);
    }

    @GetMapping({"/journey-coordinates", "/{emergencyId:[0-9]+}/journey-coordinates"})
    public ResponseEntity<?> getJourneyCoordinates(@PathVariable(required = false) Long emergencyId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByUid(currentUid).orElse(null);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Long targetEmergencyId = emergencyId;
        if (targetEmergencyId == null && "AMBULANCE_DRIVER".equals(currentUser.getRole())) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findByDriverId(currentUser.getId());
            if (ambOpt.isEmpty() && currentUser.getAmbulanceId() != null) {
                ambOpt = ambulanceRepository.findById(currentUser.getAmbulanceId());
            }
            if (ambOpt.isPresent()) {
                targetEmergencyId = ambOpt.get().getCurrentEmergencyId();
            }
        }

        if (targetEmergencyId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Emergency ID could not be determined"));
        }

        Optional<EmergencyRequest> erOpt = emergencyRepository.findById(targetEmergencyId);
        if (erOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmergencyRequest e = erOpt.get();
        Map<String, Object> map = new HashMap<>();
        map.put("emergencyId", e.getId());
        map.put("patientUid", e.getPatientUid());
        map.put("pickupAddress", e.getPickupAddress() != null ? e.getPickupAddress() : "Bangalore City Center");
        map.put("pickupLat", e.getLatitude());
        map.put("pickupLng", e.getLongitude());
        map.put("severity", e.getSeverity());
        map.put("status", e.getStatus());

        userRepository.findByUid(e.getPatientUid()).ifPresent(p -> {
            map.put("patientName", p.getFullName());
            map.put("patientPhone", p.getPhone());
            map.put("patientAge", p.getAge());
            map.put("patientBloodGroup", p.getBloodGroup());
        });

        if (e.getHospitalId() != null && hospitalRepository != null) {
            hospitalRepository.findById(e.getHospitalId()).ifPresent(h -> {
                map.put("hospitalId", h.getId());
                map.put("hospitalName", h.getName());
                map.put("hospitalLat", h.getLat());
                map.put("hospitalLng", h.getLng());
            });
        }

        if (e.getAmbulanceId() != null) {
            ambulanceRepository.findById(e.getAmbulanceId()).ifPresent(amb -> {
                map.put("ambulanceId", amb.getId());
                map.put("ambulanceUnitId", amb.getUnitId());
                map.put("ambulanceLat", amb.getLatitude());
                map.put("ambulanceLng", amb.getLongitude());
                map.put("ambulanceStatus", amb.getStatus());
            });
        }

        return ResponseEntity.ok(map);
    }

    private boolean isValidStatusTransition(String currentStatus, String newStatus) {
        if (currentStatus == null || newStatus == null) return false;
        
        String cur = normalizeAmbulanceStatus(currentStatus);
        String next = normalizeAmbulanceStatus(newStatus);

        Map<String, List<String>> validTransitions = Map.of(
            "AVAILABLE", List.of("REQUESTED"),
            "REQUESTED", List.of("ACCEPTED", "DECLINED", "REJECTED", "AVAILABLE"),
            "ACCEPTED", List.of("EN_ROUTE_TO_PATIENT", "COMPLETED"),
            "EN_ROUTE_TO_PATIENT", List.of("ARRIVED_AT_PATIENT", "COMPLETED"),
            "ARRIVED_AT_PATIENT", List.of("PATIENT_PICKED_UP", "COMPLETED"),
            "PATIENT_PICKED_UP", List.of("EN_ROUTE_TO_HOSPITAL", "COMPLETED"),
            "EN_ROUTE_TO_HOSPITAL", List.of("ARRIVED_AT_HOSPITAL", "COMPLETED"),
            "ARRIVED_AT_HOSPITAL", List.of("COMPLETED"),
            "COMPLETED", List.of("AVAILABLE")
        );

        List<String> allowed = validTransitions.get(cur);
        return allowed != null && (allowed.contains(next) || allowed.contains(newStatus.toUpperCase()));
    }

    private String normalizeAmbulanceStatus(String status) {
        if (status == null) return "";
        return switch (status.toUpperCase()) {
            case "PENDING_DRIVER_ACCEPTANCE" -> "REQUESTED";
            case "DRIVER_ACCEPTED" -> "ACCEPTED";
            case "JOURNEY_STARTED" -> "EN_ROUTE_TO_PATIENT";
            case "ARRIVED_AT_PICKUP" -> "ARRIVED_AT_PATIENT";
            case "PATIENT_ONBOARD" -> "PATIENT_PICKED_UP";
            case "REJECTED" -> "DECLINED";
            default -> status.toUpperCase();
        };
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