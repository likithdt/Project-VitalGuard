package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.doctor.DoctorAssessment;
import com.vitaguard.backend_java.doctor.DoctorAssessmentRepository;
import com.vitaguard.backend_java.hospital.*;
import com.vitaguard.backend_java.medical.*;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import com.vitaguard.backend_java.user.Vital;
import com.vitaguard.backend_java.user.VitalRepository;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/emergencies")
public class EmergenciesController {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final EmergencyWorkflowService workflowService;
    private final HospitalRepository hospitalRepository;
    private final HospitalRecommendationService recommendationService;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final VitalRepository vitalRepository;
    private final MedicalProfileRepository medicalProfileRepository;
    private final MedicalHistoryRepository medicalHistoryRepository;
    private final AIHealthAssessmentRepository aiHealthAssessmentRepository;
    private final DoctorAssessmentRepository doctorAssessmentRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;

    public EmergenciesController(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            EmergencyWorkflowService workflowService,
            HospitalRepository hospitalRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository
    ) {
        this(emergencyRepository, eventRepository, workflowService, hospitalRepository,
                recommendationService, doctorRepository, ambulanceRepository, userRepository,
                null, null, null, null, null, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public EmergenciesController(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            EmergencyWorkflowService workflowService,
            HospitalRepository hospitalRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) VitalRepository vitalRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) MedicalProfileRepository medicalProfileRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) MedicalHistoryRepository medicalHistoryRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) AIHealthAssessmentRepository aiHealthAssessmentRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) DoctorAssessmentRepository doctorAssessmentRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) PatientFamilyRelationshipRepository relationshipRepository
    ) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.workflowService = workflowService;
        this.hospitalRepository = hospitalRepository;
        this.recommendationService = recommendationService;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.vitalRepository = vitalRepository;
        this.medicalProfileRepository = medicalProfileRepository;
        this.medicalHistoryRepository = medicalHistoryRepository;
        this.aiHealthAssessmentRepository = aiHealthAssessmentRepository;
        this.doctorAssessmentRepository = doctorAssessmentRepository;
        this.relationshipRepository = relationshipRepository;
    }

    @PostMapping
    public ResponseEntity<?> createEmergency(@RequestBody Map<String, Object> body) {
        String patientUid = (String) body.get("patientUid");
        if (patientUid == null || patientUid.isEmpty()) {
            patientUid = SecurityContextHolder.getContext().getAuthentication().getName();
        }

        Double lat = 12.9716;
        Double lng = 77.5946;
        if (body.get("latitude") != null) lat = Double.valueOf(body.get("latitude").toString());
        else if (body.get("lat") != null) lat = Double.valueOf(body.get("lat").toString());

        if (body.get("longitude") != null) lng = Double.valueOf(body.get("longitude").toString());
        else if (body.get("lng") != null) lng = Double.valueOf(body.get("lng").toString());

        String description = (String) body.getOrDefault("description", "Manual Emergency Event");
        Integer riskScore = body.get("riskScore") != null ? Integer.valueOf(body.get("riskScore").toString()) : 85;
        String severity = (String) body.getOrDefault("severity", "CRITICAL");

        RiskResult risk = new RiskResult(riskScore, severity, List.of("Manual Trigger"), description);

        EmergencyRequest request = workflowService.initiateAutomaticEmergency(patientUid, 75.0, 95.0, 36.6, lat, lng, risk);
        return ResponseEntity.status(HttpStatus.CREATED).body(request);
    }

    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<?> getEmergency(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest req = emergencyRepository.findById(id).orElse(null);
        if (req == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization:
        // Patient: own emergency
        // Doctor: assigned emergencies only
        // Hospital Admin: emergencies for their hospital
        // System Admin: all emergencies
        boolean isAuthorized = false;
        String role = requester.getRole();

        if (currentUid.equals(req.getPatientUid())) {
            isAuthorized = true;
        } else if ("DOCTOR".equals(role)) {
            Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();
            isAuthorized = (req.getDoctorId() != null && (req.getDoctorId().equals(docProfileId) || req.getDoctorId().equals(requester.getId())))
                    || (req.getHospitalId() != null && req.getHospitalId().equals(requester.getHospitalId()));
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        } else if ("FAMILY_MEMBER".equals(role)) {
            isAuthorized = true;
        } else if ("AMBULANCE_DRIVER".equals(role) && req.getAmbulanceId() != null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findById(req.getAmbulanceId());
            if (ambOpt.isPresent() && ambOpt.get().getDriver() != null 
                    && ambOpt.get().getDriver().getId().equals(requester.getId())) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied to emergency event"));
        }

        return ResponseEntity.ok(enrichEmergency(req));
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<?> getTimeline(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        EmergencyRequest req = emergencyRepository.findById(id).orElse(null);
        if (req == null) return ResponseEntity.notFound().build();

        // Authorization: same as getEmergency
        boolean isAuthorized = false;
        String role = requester.getRole();

        if (currentUid.equals(req.getPatientUid())) {
            isAuthorized = true;
        } else if ("DOCTOR".equals(role) && req.getDoctorId() != null && req.getDoctorId().equals(requester.getId())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        } else if ("AMBULANCE_DRIVER".equals(role) && req.getAmbulanceId() != null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findById(req.getAmbulanceId());
            if (ambOpt.isPresent() && ambOpt.get().getDriver() != null 
                    && ambOpt.get().getDriver().getId().equals(requester.getId())) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        return ResponseEntity.ok(eventRepository.findByEmergencyIdOrderByTimestampAsc(id));
    }

    @GetMapping("/nearby")
    public ResponseEntity<?> getNearbyHospitals(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(required = false, defaultValue = "Emergency") String department
    ) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        boolean isStaff = "DOCTOR".equals(requester.getRole())
                || "HOSPITAL_ADMIN".equals(requester.getRole())
                || "ADMIN".equals(requester.getRole());
        if (!isStaff) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        return ResponseEntity.ok(recommendationService.getRecommendations(lat, lng, department));
    }

    @GetMapping("/{id}/hospital")
    public ResponseEntity<?> getAssignedHospital(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        EmergencyRequest req = emergencyRepository.findById(id).orElse(null);
        if (req == null) return ResponseEntity.notFound().build();

        // Authorization: same as getEmergency
        boolean isAuthorized = false;
        String role = requester.getRole();

        if (currentUid.equals(req.getPatientUid())) {
            isAuthorized = true;
        } else if ("DOCTOR".equals(role) && req.getDoctorId() != null && req.getDoctorId().equals(requester.getId())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        } else if ("AMBULANCE_DRIVER".equals(role) && req.getAmbulanceId() != null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findById(req.getAmbulanceId());
            if (ambOpt.isPresent() && ambOpt.get().getDriver() != null 
                    && ambOpt.get().getDriver().getId().equals(requester.getId())) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        if (req.getHospitalId() == null) {
            return ResponseEntity.noContent().build();
        }
        return hospitalRepository.findById(req.getHospitalId())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/doctors/available")
    public ResponseEntity<?> getAvailableDoctors(
            @RequestParam(required = false) Long hospitalId,
            @RequestParam(required = false) String department
    ) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        boolean isStaff = "DOCTOR".equals(requester.getRole())
                || "HOSPITAL_ADMIN".equals(requester.getRole())
                || "ADMIN".equals(requester.getRole());
        if (!isStaff) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        List<Doctor> doctors;
        if (hospitalId != null && department != null) {
            doctors = doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(hospitalId, department, true, true);
        } else if (hospitalId != null) {
            doctors = doctorRepository.findByHospitalId(hospitalId);
        } else {
            doctors = doctorRepository.findAll();
        }
        return ResponseEntity.ok(doctors);
    }

    @GetMapping("/{id}/doctor")
    public ResponseEntity<?> getAssignedDoctor(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        EmergencyRequest req = emergencyRepository.findById(id).orElse(null);
        if (req == null) return ResponseEntity.notFound().build();

        // Authorization: same as getEmergency
        boolean isAuthorized = false;
        String role = requester.getRole();

        if (currentUid.equals(req.getPatientUid())) {
            isAuthorized = true;
        } else if ("DOCTOR".equals(role) && req.getDoctorId() != null && req.getDoctorId().equals(requester.getId())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        } else if ("AMBULANCE_DRIVER".equals(role) && req.getAmbulanceId() != null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findById(req.getAmbulanceId());
            if (ambOpt.isPresent() && ambOpt.get().getDriver() != null 
                    && ambOpt.get().getDriver().getId().equals(requester.getId())) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        if (req.getDoctorId() == null) {
            return ResponseEntity.noContent().build();
        }
        if (req.getDoctorId() == -1L) {
            return ResponseEntity.ok(Map.of("name", "Emergency Duty Team", "specialization", "Emergency Support"));
        }
        return doctorRepository.findById(req.getDoctorId())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/ambulances/nearby")
    public ResponseEntity<?> getNearbyAmbulances(
            @RequestParam Double lat,
            @RequestParam Double lng
    ) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        boolean isStaff = "DOCTOR".equals(requester.getRole())
                || "HOSPITAL_ADMIN".equals(requester.getRole())
                || "ADMIN".equals(requester.getRole());
        if (!isStaff) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        List<Ambulance> list = ambulanceRepository.findByStatus("available");
        list.sort(Comparator.comparingDouble(a -> calculateDistance(lat, lng, a.getLatitude(), a.getLongitude())));
        return ResponseEntity.ok(list);
    }

    @PostMapping("/{id}/dispatch")
    public ResponseEntity<?> manualDispatchAmbulance(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (!reqOpt.isPresent()) {
            return ResponseEntity.notFound().build();
        }
        EmergencyRequest req = reqOpt.get();

        // Authorization: Assigned Doctor, Hospital admin for their hospital, or system admin
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

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to dispatch ambulance"));

        workflowService.dispatchAmbulance(req);
        return ResponseEntity.ok(req);
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<?> acceptEmergency(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        if (!"HOSPITAL_ADMIN".equals(requester.getRole()) && !"SYSTEM_ADMIN".equals(requester.getRole()) && !"ADMIN".equals(requester.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital administrators can accept emergencies"));
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

        try {
            Long hospId = requester.getHospitalId() != null ? requester.getHospitalId() : request.getHospitalId();
            EmergencyRequest accepted = workflowService.acceptHospitalEmergency(id, hospId);
            return ResponseEntity.ok(accepted);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> rejectEmergency(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

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
            EmergencyRequest updated = workflowService.rejectHospitalEmergency(id, hospId, reason);
            return ResponseEntity.ok(updated);
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

        EmergencyRequest updated = (decision != null)
                ? workflowService.setAmbulanceDecision(id, decision)
                : workflowService.setAmbulanceDecision(id, requiresAmbulance);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveEmergency(@PathVariable Long id) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        EmergencyRequest req = reqOpt.get();

        // Authorization: Assigned doctor, hospital admin for their hospital, or system admin
        boolean isAuthorized = false;
        String role = requester.getRole();
        Long docProfileId = requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId();

        if ("DOCTOR".equals(role)) {
            if (req.getDoctorId() != null && (req.getDoctorId().equals(docProfileId) || req.getDoctorId().equals(requester.getId()))) {
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

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to resolve this emergency"));

        if ("RESOLVED".equalsIgnoreCase(req.getStatus()) || "COMPLETED".equalsIgnoreCase(req.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Emergency is already resolved"));
        }

        workflowService.resolveEmergency(id);
        return ResponseEntity.ok(Map.of("success", true, "sos_id", id, "status", "resolved"));
    }

    private Map<String, Object> enrichEmergency(EmergencyRequest req) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", req.getId());
        map.put("patientUid", req.getPatientUid());
        map.put("latitude", req.getLatitude());
        map.put("longitude", req.getLongitude());
        map.put("symptoms", req.getSymptoms());
        map.put("symptomDescription", req.getSymptomDescription());
        map.put("requiredDepartment", req.getRequiredDepartment());
        map.put("hospitalId", req.getHospitalId());
        map.put("doctorId", req.getDoctorId());
        map.put("ambulanceId", req.getAmbulanceId());
        map.put("status", req.getStatus());
        map.put("createdAt", req.getCreatedAt());
        map.put("acceptedAt", req.getAcceptedAt());
        map.put("assignedAt", req.getAssignedAt());
        map.put("completedAt", req.getCompletedAt());
        map.put("cancelled", req.getCancelled());
        map.put("smsSent", req.getSmsSent());
        map.put("ambulanceDispatched", req.getAmbulanceDispatched());
        map.put("requiresAmbulance", req.getRequiresAmbulance());
        map.put("ambulanceDecision", req.getAmbulanceDecision());
        map.put("riskScore", req.getRiskScore());
        map.put("severity", req.getSeverity());
        map.put("detectedVitals", req.getDetectedVitals());

        // Hospital info
        if (req.getHospitalId() != null) {
            hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> {
                map.put("hospitalName", h.getName());
                map.put("hospitalLat", h.getLat());
                map.put("hospitalLng", h.getLng());
            });
        }

        // Doctor info
        if (req.getDoctorId() != null && req.getDoctorId() > 0) {
            doctorRepository.findById(req.getDoctorId()).ifPresent(d -> {
                map.put("doctorName", d.getName());
                map.put("doctorSpecialization", d.getSpecialization());
                map.put("doctorPhone", d.getPhone());
            });
        } else if (req.getDoctorId() != null && req.getDoctorId() == -1L) {
            map.put("doctorName", "Emergency Response Team");
        }

        // Ambulance info
        Long ambId = req.getAmbulanceId();
        if (ambId == null) {
            Optional<Ambulance> ambOpt = ambulanceRepository.findByCurrentEmergencyId(req.getId());
            if (ambOpt.isPresent()) ambId = ambOpt.get().getId();
        }
        if (ambId != null) {
            ambulanceRepository.findById(ambId).ifPresent(a -> {
                map.put("ambulanceId", a.getId());
                map.put("ambulanceUnitId", a.getUnitId());
                map.put("ambulanceStatus", a.getStatus());
                map.put("ambulanceLatitude", a.getLatitude());
                map.put("ambulanceLongitude", a.getLongitude());
                if (a.getDriver() != null) {
                    map.put("driverName", a.getDriver().getFullName());
                }
            });
        }

        // Patient info
        userRepository.findByUid(req.getPatientUid()).ifPresent(p -> {
            String contactPhone = p.getDoctorPhone() != null ? p.getDoctorPhone() : p.getPhone();
            map.put("patientName", p.getFullName());
            map.put("patientAge", p.getAge());
            map.put("patientBloodGroup", p.getBloodGroup());
            map.put("patientPhone", contactPhone);
            map.put("patientAddress", p.getAddress());
            map.put("patientEmergencyContact", contactPhone);

            Map<String, Object> patientMap = new HashMap<>();
            patientMap.put("fullName", p.getFullName());
            patientMap.put("uid", p.getUid());
            patientMap.put("age", p.getAge());
            patientMap.put("bloodGroup", p.getBloodGroup());
            patientMap.put("phone", contactPhone);
            patientMap.put("emergencyContact", contactPhone);
            patientMap.put("address", p.getAddress());
            map.put("patient", patientMap);
        });

        // Current Vitals
        Map<String, Object> vitalsMap = new HashMap<>();
        if (vitalRepository != null) {
            vitalRepository.findFirstByPatientUidOrderByRecordedAtDesc(req.getPatientUid()).ifPresent(v -> {
                vitalsMap.put("heartRate", v.getHeartRate());
                vitalsMap.put("spo2", v.getSpo2());
                vitalsMap.put("temperature", v.getTemperature());
                vitalsMap.put("bpSystolic", v.getBpSystolic());
                vitalsMap.put("bpDiastolic", v.getBpDiastolic());
                vitalsMap.put("recordedAt", v.getRecordedAt());
            });
        }
        if (vitalsMap.isEmpty() && req.getDetectedVitals() != null) {
            vitalsMap.put("detected", req.getDetectedVitals());
        }
        map.put("currentVitals", vitalsMap);

        // Medical Profile
        if (medicalProfileRepository != null) {
            medicalProfileRepository.findByUserUid(req.getPatientUid()).ifPresent(mp -> {
                Map<String, Object> profMap = new HashMap<>();
                profMap.put("existingConditions", mp.getExistingConditions());
                profMap.put("previousHeartProblems", mp.getPreviousHeartProblems());
                profMap.put("diabetes", mp.getDiabetes());
                profMap.put("hypertension", mp.getHypertension());
                profMap.put("asthma", mp.getAsthma());
                profMap.put("allergies", mp.getAllergies());
                profMap.put("currentMedications", mp.getCurrentMedications());
                profMap.put("previousSurgeries", mp.getPreviousSurgeries());
                profMap.put("previousHospitalizations", mp.getPreviousHospitalizations());
                profMap.put("customSymptoms", mp.getCustomSymptoms());
                map.put("medicalProfile", profMap);
            });
        }

        // Medical History
        if (medicalHistoryRepository != null) {
            List<MedicalHistory> histList = medicalHistoryRepository.findByPatientUid(req.getPatientUid());
            map.put("medicalHistory", histList);
        }

        // AI Health Assessment
        if (aiHealthAssessmentRepository != null) {
            aiHealthAssessmentRepository.findFirstByPatientUidOrderByRecordedAtDesc(req.getPatientUid()).ifPresent(ai -> {
                Map<String, Object> aiMap = new HashMap<>();
                aiMap.put("riskScore", ai.getRiskScore());
                aiMap.put("severity", ai.getSeverity());
                aiMap.put("deteriorationProbability", ai.getDeteriorationProbability());
                aiMap.put("anomalyScore", ai.getAnomalyScore());
                aiMap.put("predictionWindowMinutes", ai.getPredictionWindowMinutes());
                aiMap.put("trend", ai.getTrend());
                aiMap.put("explanations", ai.getExplanations());
                aiMap.put("recordedAt", ai.getRecordedAt());
                map.put("aiAssessment", aiMap);
            });
        }

        // Previous Emergencies
        List<EmergencyRequest> prevList = emergencyRepository.findByPatientUid(req.getPatientUid()).stream()
                .filter(e -> !e.getId().equals(req.getId()))
                .toList();
        map.put("previousEmergencies", prevList);

        // Doctor Assessment
        if (doctorAssessmentRepository != null) {
            doctorAssessmentRepository.findByEmergencyId(req.getId()).ifPresent(da -> {
                map.put("doctorAssessment", da);
                map.put("assessmentStatus", da.getStatus());
            });
        }

        return map;
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
}
