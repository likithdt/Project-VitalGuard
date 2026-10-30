package com.vitaguard.backend_java.doctor;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/doctor/assessment")
public class DoctorAssessmentController {

    private final DoctorAssessmentRepository assessmentRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final EmergencyWorkflowService workflowService;

    public DoctorAssessmentController(
            DoctorAssessmentRepository assessmentRepository,
            EmergencyRequestRepository emergencyRepository,
            UserRepository userRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            EmergencyWorkflowService workflowService) {
        this.assessmentRepository = assessmentRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
        this.hospitalRepository = hospitalRepository;
        this.doctorRepository = doctorRepository;
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

    // Get all pending assessments for the logged-in doctor
    @GetMapping("/pending")
    public ResponseEntity<?> getPendingAssessments() {
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
        List<DoctorAssessment> assessments = assessmentRepository.findPendingAssessmentsByDoctorId(doctor.getId());

        return ResponseEntity.ok(assessments.stream().map(this::enrichAssessment).toList());
    }

    // Get all assessments for the logged-in doctor (including completed)
    @GetMapping("/all")
    public ResponseEntity<?> getAllAssessments() {
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
        List<DoctorAssessment> assessments = assessmentRepository.findByDoctorId(doctor.getId());

        return ResponseEntity.ok(assessments.stream().map(this::enrichAssessment).toList());
    }

    // Get assessment by emergency ID (for doctor or hospital admin)
    @GetMapping("/emergency/{emergencyId}")
    public ResponseEntity<?> getAssessmentByEmergencyId(@PathVariable Long emergencyId) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmergencyRequest emergency = emergencyOpt.get();

        // Authorization: Doctor assigned to this emergency, hospital admin for their hospital, or system admin
        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("DOCTOR".equals(role)) {
            Optional<Doctor> doctorOpt = getDoctorForUser(requester);
            Long docId = doctorOpt.map(Doctor::getId).orElse(requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId());
            isAuthorized = docId != null && docId.equals(emergency.getDoctorId());
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null) {
            isAuthorized = requester.getHospitalId().equals(emergency.getHospitalId());
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this assessment"));
        }

        Optional<DoctorAssessment> assessmentOpt = assessmentRepository.findByEmergencyId(emergencyId);
        if (assessmentOpt.isEmpty()) {
            if ("DOCTOR".equals(role)) {
                Optional<Doctor> doctorOpt = getDoctorForUser(requester);
                Long docId = doctorOpt.map(Doctor::getId).orElse(requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId());
                DoctorAssessment newAssessment = new DoctorAssessment(emergencyId, docId != null ? docId : emergency.getDoctorId());
                newAssessment = assessmentRepository.save(newAssessment);
                return ResponseEntity.ok(enrichAssessment(newAssessment));
            }
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(enrichAssessment(assessmentOpt.get()));
    }

    @PostMapping("/emergency/{emergencyId}")
    public ResponseEntity<?> createOrGetAssessmentForEmergency(@PathVariable Long emergencyId) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) return ResponseEntity.notFound().build();
        EmergencyRequest emergency = emergencyOpt.get();

        Optional<Doctor> doctorOpt = getDoctorForUser(requester);
        Long docId = doctorOpt.map(Doctor::getId).orElse(requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId());

        Optional<DoctorAssessment> existing = assessmentRepository.findByEmergencyId(emergencyId);
        if (existing.isPresent()) {
            return ResponseEntity.ok(enrichAssessment(existing.get()));
        }

        DoctorAssessment assessment = new DoctorAssessment(emergencyId, docId != null ? docId : emergency.getDoctorId());
        assessment = assessmentRepository.save(assessment);
        return ResponseEntity.ok(enrichAssessment(assessment));
    }

    // Get assessment by assessment ID
    @GetMapping("/{assessmentId}")
    public ResponseEntity<?> getAssessmentById(@PathVariable Long assessmentId) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<DoctorAssessment> assessmentOpt = assessmentRepository.findById(assessmentId);
        if (assessmentOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        DoctorAssessment assessment = assessmentOpt.get();

        // Authorization check
        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("DOCTOR".equals(role)) {
            Optional<Doctor> doctorOpt = getDoctorForUser(requester);
            Long docId = doctorOpt.map(Doctor::getId).orElse(requester.getDoctorId() != null ? requester.getDoctorId() : requester.getId());
            isAuthorized = docId != null && docId.equals(assessment.getDoctorId());
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(assessment.getEmergencyId());
            if (emergencyOpt.isPresent()) {
                isAuthorized = requester.getHospitalId().equals(emergencyOpt.get().getHospitalId());
            }
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this assessment"));
        }

        return ResponseEntity.ok(enrichAssessment(assessment));
    }

    // Start assessment (mark as IN_PROGRESS)
    @PostMapping("/{assessmentId}/start")
    public ResponseEntity<?> startAssessment(@PathVariable Long assessmentId) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can start assessments"));
        }

        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();

        Optional<DoctorAssessment> assessmentOpt = assessmentRepository.findById(assessmentId);
        if (assessmentOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        DoctorAssessment assessment = assessmentOpt.get();

        if (!assessment.getDoctorId().equals(doctor.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to start this assessment"));
        }

        if ("SUBMITTED".equals(assessment.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Assessment already submitted"));
        }

        assessment.setStatus("IN_PROGRESS");
        assessment.setStartedAt(LocalDateTime.now());
        assessmentRepository.save(assessment);

        return ResponseEntity.ok(enrichAssessment(assessment));
    }

    // Submit assessment with all answers
    @PostMapping("/{assessmentId}/submit")
    public ResponseEntity<?> submitAssessment(@PathVariable Long assessmentId, @RequestBody Map<String, Object> body) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can submit assessments"));
        }

        Optional<Doctor> doctorOpt = getDoctorForUser(doctorUser);
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();

        Optional<DoctorAssessment> assessmentOpt = assessmentRepository.findById(assessmentId);
        if (assessmentOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        DoctorAssessment assessment = assessmentOpt.get();

        if (!assessment.getDoctorId().equals(doctor.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to submit this assessment"));
        }

        if ("SUBMITTED".equals(assessment.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Assessment already submitted"));
        }

        // Validate required fields
        String currentSymptoms = (String) body.get("currentSymptoms");
        String consciousnessLevel = (String) body.get("consciousnessLevel");
        String breathingStatus = (String) body.get("breathingStatus");
        String assessmentSummary = (String) body.get("assessmentSummary");
        String nextAction = (String) body.get("nextAction");

        if (currentSymptoms == null || currentSymptoms.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Current symptoms is required"));
        }
        if (consciousnessLevel == null || consciousnessLevel.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Consciousness level is required"));
        }
        if (breathingStatus == null || breathingStatus.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Breathing status is required"));
        }
        if (assessmentSummary == null || assessmentSummary.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Assessment summary is required"));
        }
        if (nextAction == null || nextAction.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Next action is required"));
        }

        // Save all answers
        assessment.setCurrentSymptoms(currentSymptoms);
        assessment.setConsciousnessLevel(consciousnessLevel);
        assessment.setBreathingStatus(breathingStatus);
        assessment.setImmediateDangerSigns((String) body.get("immediateDangerSigns"));
        assessment.setSensorReadingsEvaluation((String) body.get("sensorReadingsEvaluation"));
        assessment.setAdditionalObservations((String) body.get("additionalObservations"));
        assessment.setAssessmentSummary(assessmentSummary);
        assessment.setNextAction(nextAction);

        // Handle ambulance decision
        Boolean requiresAmbulance = (Boolean) body.get("requiresAmbulance");
        String ambulanceDecision = (String) body.get("ambulanceDecision");

        if (requiresAmbulance != null) {
            assessment.setRequiresAmbulance(requiresAmbulance);
            assessment.setAmbulanceDecision(requiresAmbulance ? "REQUIRED" : "NOT_REQUIRED");
        } else if (ambulanceDecision != null) {
            assessment.setAmbulanceDecision(ambulanceDecision);
            assessment.setRequiresAmbulance("REQUIRED".equalsIgnoreCase(ambulanceDecision));
        }

        assessment.setStatus("SUBMITTED");
        assessment.setSubmittedAt(LocalDateTime.now());
        assessmentRepository.save(assessment);

        // Update emergency with ambulance decision if provided
        if (assessment.getRequiresAmbulance() != null) {
            EmergencyRequest emergency = emergencyRepository.findById(assessment.getEmergencyId()).orElse(null);
            if (emergency != null) {
                if (assessment.getRequiresAmbulance()) {
                    emergency.setRequiresAmbulance(true);
                    emergency.setAmbulanceDecision("REQUIRED");
                    emergency.setStatus("AMBULANCE_REQUESTED");
                    emergencyRepository.save(emergency);
                    // Trigger ambulance dispatch
                    if (workflowService != null) {
                        workflowService.dispatchAmbulance(emergency);
                    }
                } else {
                    emergency.setRequiresAmbulance(false);
                    emergency.setAmbulanceDecision("NOT_REQUIRED");
                    emergency.setStatus("AMBULANCE_NOT_REQUIRED");
                    emergencyRepository.save(emergency);
                }
            }
        }

        return ResponseEntity.ok(enrichAssessment(assessment));
    }

    private Map<String, Object> enrichAssessment(DoctorAssessment assessment) {
        Map<String, Object> enriched = new HashMap<>();

        enriched.put("id", assessment.getId());
        enriched.put("emergencyId", assessment.getEmergencyId());
        enriched.put("doctorId", assessment.getDoctorId());
        enriched.put("status", assessment.getStatus());
        enriched.put("currentSymptoms", assessment.getCurrentSymptoms());
        enriched.put("consciousnessLevel", assessment.getConsciousnessLevel());
        enriched.put("breathingStatus", assessment.getBreathingStatus());
        enriched.put("immediateDangerSigns", assessment.getImmediateDangerSigns());
        enriched.put("sensorReadingsEvaluation", assessment.getSensorReadingsEvaluation());
        enriched.put("additionalObservations", assessment.getAdditionalObservations());
        enriched.put("assessmentSummary", assessment.getAssessmentSummary());
        enriched.put("nextAction", assessment.getNextAction());
        enriched.put("requiresAmbulance", assessment.getRequiresAmbulance());
        enriched.put("ambulanceDecision", assessment.getAmbulanceDecision());
        enriched.put("createdAt", assessment.getCreatedAt());
        enriched.put("startedAt", assessment.getStartedAt());
        enriched.put("submittedAt", assessment.getSubmittedAt());

        // Enrich with emergency details
        emergencyRepository.findById(assessment.getEmergencyId()).ifPresent(emergency -> {
            enriched.put("emergency", enrichEmergency(emergency));
        });

        // Enrich with doctor details
        doctorRepository.findById(assessment.getDoctorId()).ifPresent(doc -> {
            enriched.put("doctorName", doc.getName());
            enriched.put("doctorSpecialization", doc.getSpecialization());
        });

        return enriched;
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
        enriched.put("ambulanceDecision", request.getAmbulanceDecision());
        enriched.put("riskScore", request.getRiskScore());
        enriched.put("severity", request.getSeverity());
        enriched.put("detectedVitals", request.getDetectedVitals());

        if (request.getHospitalId() != null) {
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                enriched.put("hospitalName", h.getName());
                enriched.put("hospitalLat", h.getLat());
                enriched.put("hospitalLng", h.getLng());
            });
        }

        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            doctorRepository.findById(request.getDoctorId()).ifPresent(d -> {
                enriched.put("doctorName", d.getName());
                enriched.put("doctorSpecialization", d.getSpecialization());
            });
        } else if (request.getDoctorId() != null && request.getDoctorId() == -1L) {
            enriched.put("doctorName", "Emergency Team");
        }

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