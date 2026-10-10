package com.vitaguard.backend_java.doctor;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
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

import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;

@RestController
@RequestMapping("/api/doctor")
public class DoctorController {

    private final DoctorRepository doctorRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final EmergencyWorkflowService workflowService;

    public DoctorController(DoctorRepository doctorRepository,
                            EmergencyRequestRepository emergencyRepository,
                            UserRepository userRepository,
                            HospitalRepository hospitalRepository,
                            AmbulanceRepository ambulanceRepository) {
        this(doctorRepository, emergencyRepository, userRepository, hospitalRepository, ambulanceRepository, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DoctorController(DoctorRepository doctorRepository,
                            EmergencyRequestRepository emergencyRepository,
                            UserRepository userRepository,
                            HospitalRepository hospitalRepository,
                            AmbulanceRepository ambulanceRepository,
                            @org.springframework.beans.factory.annotation.Autowired(required = false) EmergencyWorkflowService workflowService) {
        this.doctorRepository = doctorRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
        this.hospitalRepository = hospitalRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.workflowService = workflowService;
    }

    private Optional<Doctor> getDoctorForUser(User doctorUser) {
        if (doctorUser == null) return Optional.empty();
        if (doctorUser.getDoctorId() != null) {
            Optional<Doctor> d = doctorRepository.findById(doctorUser.getDoctorId());
            if (d.isPresent()) return d;
        }
        Optional<Doctor> byId = doctorRepository.findById(doctorUser.getId());
        if (byId.isPresent()) return byId;

        if (doctorUser.getHospitalId() != null) {
            return doctorRepository.findByHospitalId(doctorUser.getHospitalId()).stream()
                    .filter(d -> d.getName().equalsIgnoreCase(doctorUser.getFullName())
                            || (d.getPhone() != null && d.getPhone().equals(doctorUser.getPhone())))
                    .findFirst();
        }
        return Optional.empty();
    }

    @GetMapping("/emergencies")
    public ResponseEntity<?> getAssignedEmergencies() {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();
        List<EmergencyRequest> emergencies = emergencyRepository.findByDoctorId(doctor.getId());
        return ResponseEntity.ok(enrichEmergencies(emergencies));
    }

    @GetMapping("/patients")
    public ResponseEntity<?> getAssignedPatients() {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();
        List<EmergencyRequest> emergencies = emergencyRepository.findByDoctorId(doctor.getId());

        // Extract unique patients
        List<Map<String, Object>> patients = emergencies.stream()
                .map(e -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("emergencyId", e.getId());
                    map.put("patientUid", e.getPatientUid());
                    map.put("severity", e.getSeverity());
                    map.put("riskScore", e.getRiskScore());
                    map.put("status", e.getStatus());
                    map.put("detectedVitals", e.getDetectedVitals());
                    map.put("createdAt", e.getCreatedAt());
                    return map;
                })
                .toList();

        return ResponseEntity.ok(patients);
    }

    @GetMapping("/emergency/{emergencyId}")
    public ResponseEntity<?> getEmergencyDetails(@PathVariable Long emergencyId) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmergencyRequest emergency = emergencyOpt.get();

        // Verify this doctor is assigned to this emergency
        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty() || !doctorOpt.get().getId().equals(emergency.getDoctorId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this emergency"));
        }

        return ResponseEntity.ok(enrichEmergency(emergency));
    }

    @PostMapping("/status")
    public ResponseEntity<?> updateAvailability(@RequestBody Map<String, Object> body) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can update availability"));
        }

        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Doctor doctor = doctorOpt.get();
        Boolean onDuty = (Boolean) body.get("onDuty");
        Boolean availableForEmergency = (Boolean) body.get("availableForEmergency");

        if (onDuty != null) doctor.setOnDuty(onDuty);
        if (availableForEmergency != null) doctor.setAvailableForEmergency(availableForEmergency);

        doctorRepository.save(doctor);
        return ResponseEntity.ok(doctor);
    }

    @PostMapping({"/emergency/{emergencyId}/resolve", "/resolve/{emergencyId}"})
    public ResponseEntity<?> resolveEmergency(@PathVariable Long emergencyId) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can resolve emergencies"));
        }

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmergencyRequest emergency = emergencyOpt.get();

        // Verify this doctor is assigned to this emergency or belongs to the assigned hospital
        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        Long docId = doctorOpt.map(Doctor::getId).orElse(doctorUser.getDoctorId() != null ? doctorUser.getDoctorId() : doctorUser.getId());
        boolean isAssignedDoctor = (emergency.getDoctorId() != null && (emergency.getDoctorId().equals(docId) || emergency.getDoctorId().equals(doctorUser.getId())))
                || (emergency.getHospitalId() != null && (emergency.getHospitalId().equals(doctorUser.getHospitalId()) || (doctorOpt.isPresent() && emergency.getHospitalId().equals(doctorOpt.get().getHospitalId()))));

        if (!isAssignedDoctor) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to resolve this emergency"));
        }

        // Reject duplicate resolution attempts
        if ("RESOLVED".equalsIgnoreCase(emergency.getStatus()) || "COMPLETED".equalsIgnoreCase(emergency.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Emergency is already resolved"));
        }

        if (workflowService != null) {
            workflowService.resolveEmergency(emergencyId);
        } else {
            emergency.setStatus("RESOLVED");
            emergency.setCompletedAt(java.time.LocalDateTime.now());
            emergencyRepository.save(emergency);

            // Release doctor
            doctorOpt.ifPresent(doc -> {
                doc.setAvailableForEmergency(true);
                doctorRepository.save(doc);
            });

            // Release hospital resources
            if (emergency.getHospitalId() != null) {
                hospitalRepository.findById(emergency.getHospitalId()).ifPresent(h -> {
                    h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                    h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                    hospitalRepository.save(h);
                });
            }

            // Release ambulance
            if (emergency.getAmbulanceId() != null) {
                ambulanceRepository.findById(emergency.getAmbulanceId()).ifPresent(amb -> {
                    amb.setStatus("AVAILABLE");
                    amb.setCurrentEmergencyId(null);
                    ambulanceRepository.save(amb);
                });
            }
        }

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("emergencyId", emergencyId);
        res.put("status", "resolved");
        return ResponseEntity.ok(res);
    }

    private List<Map<String, Object>> enrichEmergencies(List<EmergencyRequest> emergencies) {
        return emergencies.stream().map(this::enrichEmergency).toList();
    }

    private Map<String, Object> enrichEmergency(EmergencyRequest request) {
        Map<String, Object> enriched = new HashMap<>();

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

        // Hospital info
        if (request.getHospitalId() != null) {
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                enriched.put("hospitalName", h.getName());
                enriched.put("hospitalLat", h.getLat());
                enriched.put("hospitalLng", h.getLng());
            });
        }

        // Ambulance info
        if (request.getAmbulanceId() != null) {
            ambulanceRepository.findById(request.getAmbulanceId()).ifPresent(a -> {
                enriched.put("ambulanceUnitId", a.getUnitId());
                enriched.put("ambulanceStatus", a.getStatus());
                enriched.put("ambulanceLatitude", a.getLatitude());
                enriched.put("ambulanceLongitude", a.getLongitude());
                if (a.getDriver() != null) {
                    enriched.put("driverName", a.getDriver().getFullName());
                }
            });
        }

        // Patient info
        userRepository.findByUid(request.getPatientUid()).ifPresent(p -> {
            enriched.put("patientName", p.getFullName());
            enriched.put("patientAge", p.getAge());
            enriched.put("patientBloodGroup", p.getBloodGroup());
            enriched.put("patientPhone", p.getDoctorPhone());
            enriched.put("patientAddress", p.getAddress());
        });

        return enriched;
    }
}