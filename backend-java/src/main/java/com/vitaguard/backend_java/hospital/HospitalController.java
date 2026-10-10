package com.vitaguard.backend_java.hospital;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
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

import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;

@RestController
@RequestMapping("/api/hospital")
public class HospitalController {

    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final DoctorRepository doctorRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final EmergencyWorkflowService workflowService;

    public HospitalController(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            DoctorRepository doctorRepository,
            EmergencyRequestRepository emergencyRepository,
            UserRepository userRepository,
            AmbulanceRepository ambulanceRepository
    ) {
        this(hospitalRepository, departmentRepository, doctorRepository, emergencyRepository, userRepository, ambulanceRepository, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public HospitalController(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            DoctorRepository doctorRepository,
            EmergencyRequestRepository emergencyRepository,
            UserRepository userRepository,
            AmbulanceRepository ambulanceRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) EmergencyWorkflowService workflowService
    ) {
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.doctorRepository = doctorRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.workflowService = workflowService;
    }

    @GetMapping
    public ResponseEntity<List<Hospital>> listHospitals() {
        return ResponseEntity.ok(hospitalRepository.findAll());
    }

    @GetMapping("/emergencies")
    public ResponseEntity<?> getEmergencies() {
        String adminUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User admin = userRepository.findByUid(adminUid).orElse(null);

        if (admin == null || (!"HOSPITAL_ADMIN".equals(admin.getRole()) && !"DOCTOR".equals(admin.getRole()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital admins and doctors can access this endpoint"));
        }

        if ("DOCTOR".equals(admin.getRole())) {
            Long docProfileId = admin.getDoctorId() != null ? admin.getDoctorId() : admin.getId();
            List<EmergencyRequest> emergencies = emergencyRepository.findByDoctorId(docProfileId);
            return ResponseEntity.ok(enrichEmergencies(emergencies));
        }

        if (admin.getHospitalId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Hospital admin not linked to a hospital"));
        }

        // Return only emergencies assigned to THIS hospital
        List<EmergencyRequest> emergencies = emergencyRepository.findByHospitalId(admin.getHospitalId());
        return ResponseEntity.ok(enrichEmergencies(emergencies));
    }

    @GetMapping("/incoming")
    public ResponseEntity<?> getIncomingEmergencies() {
        String adminUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User admin = userRepository.findByUid(adminUid).orElse(null);

        if (admin == null || !"HOSPITAL_ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital admins can access this endpoint"));
        }

        if (admin.getHospitalId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Hospital admin not linked to a hospital"));
        }

        // Return emergencies that are incoming (not yet resolved) for THIS hospital
        List<EmergencyRequest> emergencies = emergencyRepository.findByHospitalIdAndStatusIn(admin.getHospitalId(), List.of(
                "HOSPITAL_ASSIGNED", "HOSPITAL_ACCEPTED", "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED", "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED",
                "AMBULANCE_DISPATCHED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP",
                "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "AMBULANCE_NOT_REQUIRED"
        ));
        return ResponseEntity.ok(enrichEmergencies(emergencies));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        String adminUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User admin = userRepository.findByUid(adminUid).orElse(null);

        if (admin == null || !"HOSPITAL_ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital admins can access this endpoint"));
        }

        if (admin.getHospitalId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Hospital admin not linked to a hospital"));
        }

        Hospital hospital = hospitalRepository.findById(admin.getHospitalId()).orElse(null);
        if (hospital == null) {
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("hospital", hospital);
        stats.put("total_emergencies", emergencyRepository.countByHospitalId(admin.getHospitalId()));
        stats.put("active_emergencies", emergencyRepository.findByHospitalIdAndStatusIn(admin.getHospitalId(), List.of(
                "HOSPITAL_ASSIGNED", "HOSPITAL_ACCEPTED", "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED", "AMBULANCE_REQUESTED", "AMBULANCE_ACCEPTED",
                "AMBULANCE_DISPATCHED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP",
                "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "AMBULANCE_NOT_REQUIRED"
        )).size());
        stats.put("available_beds", hospital.getAvailableBeds());
        stats.put("total_beds", hospital.getTotalBeds());
        stats.put("available_doctors", hospital.getAvailableDoctors());
        stats.put("total_doctors", hospital.getTotalDoctors());
        stats.put("doctors_on_duty", doctorRepository.findByHospitalIdAndOnDuty(admin.getHospitalId(), true).size());
        return ResponseEntity.ok(stats);
    }

    @PostMapping("/resolve/{id}")
    public ResponseEntity<?> resolveCase(@PathVariable Long id) {
        String adminUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User admin = userRepository.findByUid(adminUid).orElse(null);

        if (admin == null || !"HOSPITAL_ADMIN".equals(admin.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only hospital admins can resolve cases"));
        }

        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isPresent()) {
            EmergencyRequest req = reqOpt.get();

            // Verify this emergency belongs to this hospital
            if (!admin.getHospitalId().equals(req.getHospitalId())) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Cannot resolve emergency from another hospital"));
            }

            // Reject duplicate resolution attempts
            if ("RESOLVED".equalsIgnoreCase(req.getStatus()) || "COMPLETED".equalsIgnoreCase(req.getStatus())) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Emergency is already resolved"));
            }

            if (workflowService != null) {
                workflowService.resolveEmergency(id);
            } else {
                req.setStatus("RESOLVED");
                req.setCompletedAt(java.time.LocalDateTime.now());
                emergencyRepository.save(req);

                // Re-increment beds/doctors
                Hospital hospital = hospitalRepository.findById(req.getHospitalId()).orElse(null);
                if (hospital != null) {
                    hospital.setAvailableBeds(Math.min(hospital.getTotalBeds(), hospital.getAvailableBeds() + 1));
                    hospital.setAvailableDoctors(Math.min(hospital.getTotalDoctors(), hospital.getAvailableDoctors() + 1));
                    hospitalRepository.save(hospital);
                }

                // Release doctor
                if (req.getDoctorId() != null && req.getDoctorId() > 0) {
                    doctorRepository.findById(req.getDoctorId()).ifPresent(doc -> {
                        doc.setAvailableForEmergency(true);
                        doctorRepository.save(doc);
                    });
                }

                // Release ambulance
                if (req.getAmbulanceId() != null) {
                    ambulanceRepository.findById(req.getAmbulanceId()).ifPresent(amb -> {
                        amb.setStatus("AVAILABLE");
                        amb.setCurrentEmergencyId(null);
                        ambulanceRepository.save(amb);
                    });
                }
            }

            Map<String, Object> res = new HashMap<>();
            res.put("success", true);
            res.put("sos_id", id.toString());
            res.put("status", "resolved");
            return ResponseEntity.ok(res);
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/departments/{name}")
    public ResponseEntity<?> getHospitalDepartments(@PathVariable String name) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return hospitalRepository.findByName(name)
                .map(hospital -> {
                    Map<String, Object> data = new HashMap<>();
                    data.put("departments", departmentRepository.findByHospitalId(hospital.getId()));
                    data.put("doctors", doctorRepository.findByHospitalId(hospital.getId()));
                    return ResponseEntity.ok(data);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/departments")
    public ResponseEntity<?> configureDepartment(@RequestBody Map<String, Object> payload) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(currentUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Long depId = ((Number) payload.get("id")).longValue();

        // Verify department exists
        Optional<HospitalDepartment> depOpt = departmentRepository.findById(depId);
        if (depOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        // If requester is a HOSPITAL_ADMIN, verify department belongs to their hospital
        if ("HOSPITAL_ADMIN".equals(requester.getRole()) && requester.getHospitalId() != null) {
            if (!depOpt.get().getHospital().getId().equals(requester.getHospitalId())) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Department not found or not in your hospital"));
            }
        }

        Boolean available = payload.containsKey("available") ? (Boolean) payload.get("available") : null;
        Boolean emergencyService = payload.containsKey("emergencyService") ? (Boolean) payload.get("emergencyService") : null;
        Boolean acceptingPatients = payload.containsKey("acceptingPatients") ? (Boolean) payload.get("acceptingPatients") : null;
        Integer availableBeds = payload.containsKey("availableBeds") && payload.get("availableBeds") != null ? ((Number) payload.get("availableBeds")).intValue() : null;
        Integer availableDoctors = payload.containsKey("availableDoctors") && payload.get("availableDoctors") != null ? ((Number) payload.get("availableDoctors")).intValue() : null;

        return depOpt.map(dep -> {
            if (available != null) dep.setAvailable(available);
            if (emergencyService != null) dep.setEmergencyService(emergencyService);
            if (acceptingPatients != null) dep.setAcceptingPatients(acceptingPatients);
            if (availableBeds != null) dep.setAvailableBeds(availableBeds);
            if (availableDoctors != null) dep.setAvailableDoctors(availableDoctors);
            departmentRepository.save(dep);
            return ResponseEntity.ok(dep);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/doctors/status")
    public ResponseEntity<?> toggleDoctorStatus(@RequestBody Map<String, Object> payload) {
        Long docId = ((Number) payload.get("id")).longValue();
        Boolean onDuty = (Boolean) payload.get("onDuty");
        Boolean availableForEmergency = (Boolean) payload.get("availableForEmergency");

        return doctorRepository.findById(docId)
                .map(doc -> {
                    doc.setOnDuty(onDuty);
                    doc.setAvailableForEmergency(availableForEmergency);
                    doctorRepository.save(doc);
                    return ResponseEntity.ok(doc);
                })
                .orElse(ResponseEntity.notFound().build());
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
            });
        }

        // Doctor info
        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            doctorRepository.findById(request.getDoctorId()).ifPresent(d -> {
                enriched.put("doctorName", d.getName());
                enriched.put("doctorSpecialization", d.getSpecialization());
            });
        } else if (request.getDoctorId() != null && request.getDoctorId() == -1L) {
            enriched.put("doctorName", "Emergency Team");
        }

        // Ambulance info
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