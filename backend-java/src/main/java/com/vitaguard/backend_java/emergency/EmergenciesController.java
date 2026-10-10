package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.*;
import com.vitaguard.backend_java.medical.RiskResult;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
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
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.workflowService = workflowService;
        this.hospitalRepository = hospitalRepository;
        this.recommendationService = recommendationService;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<?> createEmergency(@RequestBody Map<String, Object> body) {
        String patientUid = (String) body.get("patientUid");
        if (patientUid == null || patientUid.isEmpty()) {
            patientUid = SecurityContextHolder.getContext().getAuthentication().getName();
        }

        Double lat = 12.9716;
        Double lng = 77.5946;
        if (body.containsKey("latitude")) lat = Double.valueOf(body.get("latitude").toString());
        else if (body.containsKey("lat")) lat = Double.valueOf(body.get("lat").toString());

        if (body.containsKey("longitude")) lng = Double.valueOf(body.get("longitude").toString());
        else if (body.containsKey("lng")) lng = Double.valueOf(body.get("lng").toString());

        String description = (String) body.getOrDefault("description", "Manual Emergency Event");
        Integer riskScore = body.containsKey("riskScore") ? Integer.valueOf(body.get("riskScore").toString()) : 85;
        String severity = (String) body.getOrDefault("severity", "CRITICAL");

        RiskResult risk = new RiskResult(riskScore, severity, List.of("Manual Trigger"), description);

        EmergencyRequest request = workflowService.initiateAutomaticEmergency(patientUid, 75.0, 95.0, 36.6, lat, lng, risk);
        return ResponseEntity.status(HttpStatus.CREATED).body(request);
    }

    @GetMapping("/{id}")
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

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied to emergency event"));
        }

        return ResponseEntity.ok(req);
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

        // Authorization: Hospital admin for their hospital, or system admin
        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        workflowService.dispatchAmbulance(req);
        return ResponseEntity.ok(req);
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

        if ("DOCTOR".equals(role) && req.getDoctorId() != null && req.getDoctorId().equals(requester.getId())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(req.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        if ("RESOLVED".equalsIgnoreCase(req.getStatus()) || "COMPLETED".equalsIgnoreCase(req.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Emergency is already resolved"));
        }

        workflowService.resolveEmergency(id);
        return ResponseEntity.ok(Map.of("success", true, "sos_id", id, "status", "resolved"));
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
