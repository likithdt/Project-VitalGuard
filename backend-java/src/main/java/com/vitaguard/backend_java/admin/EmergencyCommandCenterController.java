package com.vitaguard.backend_java.admin;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyEvent;
import com.vitaguard.backend_java.emergency.EmergencyEventRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.medical.AIHealthAssessment;
import com.vitaguard.backend_java.medical.AIHealthAssessmentRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/emergencies")
public class EmergencyCommandCenterController {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final AIHealthAssessmentRepository aiRepository;

    private static final List<String> ACTIVE_STATUSES = List.of(
            "DETECTED", "HOSPITAL_ASSIGNED", "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED",
            "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED", "AMBULANCE_DISPATCHED",
            "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP",
            "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL");

    private static final List<String> RESOLVED_STATUSES = List.of("RESOLVED", "COMPLETED", "CANCELLED");

    public EmergencyCommandCenterController(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            AIHealthAssessmentRepository aiRepository) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.hospitalRepository = hospitalRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.aiRepository = aiRepository;
    }

    private User getCurrentUser() {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUid(uid).orElse(null);
    }

    private boolean isSystemAdmin(User user) {
        return user != null && "SYSTEM_ADMIN".equals(user.getRole());
    }

    private ResponseEntity<?> checkSystemAdmin() {
        User currentUser = getCurrentUser();
        if (!isSystemAdmin(currentUser)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: SYSTEM_ADMIN role required"));
        }
        return null;
    }

    @GetMapping("/active")
    public ResponseEntity<?> getActiveEmergencies(
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long hospitalId,
            @RequestParam(required = false) String ambulanceStatus) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        List<EmergencyRequest> emergencies = emergencyRepository.findByStatusIn(ACTIVE_STATUSES);

        // Apply filters
        if (severity != null && !"ALL".equals(severity)) {
            emergencies = emergencies.stream()
                    .filter(e -> severity.equalsIgnoreCase(e.getSeverity()))
                    .collect(Collectors.toList());
        }
        if (status != null && !"ALL".equals(status)) {
            emergencies = emergencies.stream()
                    .filter(e -> status.equalsIgnoreCase(e.getStatus()))
                    .collect(Collectors.toList());
        }
        if (hospitalId != null) {
            emergencies = emergencies.stream()
                    .filter(e -> hospitalId.equals(e.getHospitalId()))
                    .collect(Collectors.toList());
        }
        if (ambulanceStatus != null && !"ALL".equals(ambulanceStatus)) {
            emergencies = emergencies.stream()
                    .filter(e -> e.getAmbulanceId() != null)
                    .filter(e -> {
                        Ambulance amb = ambulanceRepository.findById(e.getAmbulanceId()).orElse(null);
                        return amb != null && ambulanceStatus.equalsIgnoreCase(amb.getStatus());
                    })
                    .collect(Collectors.toList());
        }

        // Sort: CRITICAL first, then HIGH, then MODERATE, then LOW; within same
        // severity, newest first
        emergencies.sort((a, b) -> {
            int severityOrder = getSeverityOrder(b.getSeverity()) - getSeverityOrder(a.getSeverity());
            if (severityOrder != 0)
                return severityOrder;
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });

        // Enrich with related data
        List<Map<String, Object>> result = emergencies.stream().map(this::enrichEmergency).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getEmergencyStats() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        List<EmergencyRequest> activeEmergencies = emergencyRepository.findByStatusIn(ACTIVE_STATUSES);
        List<Ambulance> activeAmbulances = ambulanceRepository.findByStatusIn(List.of(
                "REQUESTED", "ACCEPTED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT",
                "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"));

        Map<String, Object> stats = new HashMap<>();
        stats.put("activeEmergencies", activeEmergencies.size());
        stats.put("critical",
                activeEmergencies.stream().filter(e -> "CRITICAL".equalsIgnoreCase(e.getSeverity())).count());
        stats.put("high", activeEmergencies.stream().filter(e -> "HIGH".equalsIgnoreCase(e.getSeverity())).count());
        stats.put("moderate",
                activeEmergencies.stream().filter(e -> "MODERATE".equalsIgnoreCase(e.getSeverity())).count());
        stats.put("low", activeEmergencies.stream().filter(e -> "LOW".equalsIgnoreCase(e.getSeverity())).count());
        stats.put("ambulancesActive", activeAmbulances.size());
        stats.put("patientsInTransit", activeEmergencies.stream()
                .filter(e -> List.of("PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL").contains(e.getStatus())).count());

        Set<Long> receivingHospitals = activeEmergencies.stream()
                .map(EmergencyRequest::getHospitalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        stats.put("hospitalsReceiving", receivingHospitals.size());

        return ResponseEntity.ok(stats);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getEmergencyDetails(@PathVariable Long id) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        EmergencyRequest emergency = emergencyRepository.findById(id).orElse(null);
        if (emergency == null) {
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> result = enrichEmergency(emergency);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<?> getEmergencyTimeline(@PathVariable Long id) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        EmergencyRequest emergency = emergencyRepository.findById(id).orElse(null);
        if (emergency == null) {
            return ResponseEntity.notFound().build();
        }

        List<EmergencyEvent> events = eventRepository.findByEmergencyIdOrderByTimestampAsc(id);
        return ResponseEntity.ok(events);
    }

    @GetMapping("/ambulances/active")
    public ResponseEntity<?> getActiveAmbulances() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        List<Ambulance> ambulances = ambulanceRepository.findByStatusIn(List.of(
                "REQUESTED", "ACCEPTED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT",
                "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"));

        List<Map<String, Object>> result = ambulances.stream().map(this::enrichAmbulance).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/hospitals/status")
    public ResponseEntity<?> getHospitalStatuses() {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        List<Hospital> hospitals = hospitalRepository.findAll();
        List<Map<String, Object>> result = hospitals.stream().map(this::enrichHospital).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/search")
    public ResponseEntity<?> searchEmergencies(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "20") int limit) {
        ResponseEntity<?> authCheck = checkSystemAdmin();
        if (authCheck != null)
            return authCheck;

        String lowerQuery = query.toLowerCase();
        List<EmergencyRequest> allEmergencies = emergencyRepository.findAll();

        List<EmergencyRequest> results = allEmergencies.stream()
                .filter(e -> {
                    String patientUid = e.getPatientUid() != null ? e.getPatientUid().toLowerCase() : "";
                    String emergencyId = "SOS-" + e.getId();
                    String hospitalName = e.getHospitalId() != null
                            ? hospitalRepository.findById(e.getHospitalId()).map(Hospital::getName).orElse("")
                                    .toLowerCase()
                            : "";
                    String doctorName = e.getDoctorId() != null && e.getDoctorId() > 0
                            ? doctorRepository.findById(e.getDoctorId()).map(Doctor::getName).orElse("").toLowerCase()
                            : "";
                    String ambulanceUnit = e.getAmbulanceId() != null
                            ? ambulanceRepository.findById(e.getAmbulanceId()).map(Ambulance::getUnitId).orElse("")
                                    .toLowerCase()
                            : "";

                    return emergencyId.toLowerCase().contains(lowerQuery)
                            || patientUid.contains(lowerQuery)
                            || hospitalName.contains(lowerQuery)
                            || doctorName.contains(lowerQuery)
                            || ambulanceUnit.contains(lowerQuery);
                })
                .limit(limit)
                .collect(Collectors.toList());

        List<Map<String, Object>> result = results.stream().map(this::enrichEmergency).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    private Map<String, Object> enrichEmergency(EmergencyRequest e) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", e.getId());
        map.put("patientUid", e.getPatientUid());
        map.put("patientName", getPatientName(e.getPatientUid()));
        map.put("latitude", e.getLatitude());
        map.put("longitude", e.getLongitude());
        map.put("symptoms", e.getSymptoms());
        map.put("symptomDescription", e.getSymptomDescription());
        map.put("requiredDepartment", e.getRequiredDepartment());
        map.put("status", e.getStatus());
        map.put("severity", e.getSeverity());
        map.put("riskScore", e.getRiskScore());
        map.put("detectedVitals", e.getDetectedVitals());
        map.put("createdAt", e.getCreatedAt());
        map.put("acceptedAt", e.getAcceptedAt());
        map.put("assignedAt", e.getAssignedAt());
        map.put("completedAt", e.getCompletedAt());
        map.put("cancelled", e.getCancelled());

        // Hospital
        if (e.getHospitalId() != null) {
            Hospital hospital = hospitalRepository.findById(e.getHospitalId()).orElse(null);
            if (hospital != null) {
                map.put("hospital", Map.of(
                        "id", hospital.getId(),
                        "name", hospital.getName(),
                        "lat", hospital.getLat(),
                        "lng", hospital.getLng(),
                        "availableBeds", hospital.getAvailableBeds(),
                        "totalBeds", hospital.getTotalBeds(),
                        "distanceKm",
                        calculateDistance(e.getLatitude(), e.getLongitude(), hospital.getLat(), hospital.getLng())));
            }
        }

        // Doctor
        if (e.getDoctorId() != null && e.getDoctorId() > 0) {
            Doctor doctor = doctorRepository.findById(e.getDoctorId()).orElse(null);
            if (doctor != null) {
                map.put("doctor", Map.of(
                        "id", doctor.getId(),
                        "name", doctor.getName(),
                        "specialization", doctor.getSpecialization(),
                        "departmentName", doctor.getDepartmentName(),
                        "onDuty", doctor.getOnDuty(),
                        "availableForEmergency", doctor.getAvailableForEmergency(),
                        "hospitalId", doctor.getHospital() != null ? doctor.getHospital().getId() : null));
            }
        } else if (e.getDoctorId() != null && e.getDoctorId() == -1L) {
            map.put("doctor", Map.of("name", "Emergency Duty Team", "specialization", "Emergency Support"));
        }

        // Ambulance
        if (e.getAmbulanceId() != null) {
            Ambulance ambulance = ambulanceRepository.findById(e.getAmbulanceId()).orElse(null);
            if (ambulance != null) {
                map.put("ambulance", enrichAmbulance(ambulance));
            }
        }

        // AI Assessment
        AIHealthAssessment ai = aiRepository.findFirstByPatientUidOrderByRecordedAtDesc(e.getPatientUid()).orElse(null);
        if (ai != null) {
            map.put("aiAssessment", Map.of(
                    "riskScore", ai.getRiskScore(),
                    "severity", ai.getSeverity(),
                    "deteriorationProbability", ai.getDeteriorationProbability(),
                    "anomalyScore", ai.getAnomalyScore(),
                    "trend", ai.getTrend(),
                    "explanations", ai.getExplanations(),
                    "recordedAt", ai.getRecordedAt()));
        }

        return map;
    }

    private Map<String, Object> enrichAmbulance(Ambulance a) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", a.getId());
        map.put("unitId", a.getUnitId());
        map.put("hospitalName", a.getHospitalName());
        map.put("status", a.getStatus());
        map.put("latitude", a.getLatitude());
        map.put("longitude", a.getLongitude());
        map.put("currentEmergencyId", a.getCurrentEmergencyId());
        if (a.getDriver() != null) {
            map.put("driver", Map.of(
                    "id", a.getDriver().getId(),
                    "fullName", a.getDriver().getFullName(),
                    "uid", a.getDriver().getUid()));
        }
        return map;
    }

    private Map<String, Object> enrichHospital(Hospital h) {
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

        // Count incoming emergencies
        long incoming = emergencyRepository.findByHospitalIdAndStatusIn(h.getId(), ACTIVE_STATUSES).size();
        map.put("incomingEmergencies", incoming);

        return map;
    }

    private String getPatientName(String patientUid) {
        return userRepository.findByUid(patientUid)
                .map(User::getFullName)
                .orElse("Unknown Patient");
    }

    private int getSeverityOrder(String severity) {
        if (severity == null) {
            return 0;
        }
        switch (severity.toUpperCase()) {
            case "CRITICAL":
                return 4;
            case "HIGH":
                return 3;
            case "MODERATE":
                return 2;
            case "LOW":
                return 1;
            default:
                return 0;
        }
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(earthRadius * c * 100.0) / 100.0;
    }
}