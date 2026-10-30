package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequest;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceService;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorAssessment;
import com.vitaguard.backend_java.doctor.DoctorAssessmentRepository;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.*;
import com.vitaguard.backend_java.user.FamilyNotificationService;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import com.vitaguard.backend_java.medical.RiskResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Service
@Transactional
public class EmergencyWorkflowService {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final HospitalRecommendationService recommendationService;
    private final DoctorRepository doctorRepository;
    private final DoctorAssessmentRepository doctorAssessmentRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceService ambulanceService;
    private final UserRepository userRepository;
    private final FamilyNotificationService familyNotificationService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MedicalProfileRepository medicalProfileRepository;
    private final AmbulanceRequestRepository ambulanceRequestRepository;
    private final HospitalAssignmentRepository hospitalAssignmentRepository;

    public EmergencyWorkflowService(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            AmbulanceService ambulanceService,
            UserRepository userRepository,
            FamilyNotificationService familyNotificationService,
            SimpMessagingTemplate messagingTemplate,
            MedicalProfileRepository medicalProfileRepository
    ) {
        this(emergencyRepository, eventRepository, hospitalRepository, departmentRepository,
                recommendationService, doctorRepository, null, ambulanceRepository, ambulanceService,
                userRepository, familyNotificationService, messagingTemplate, medicalProfileRepository, null, null);
    }

    public EmergencyWorkflowService(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            AmbulanceService ambulanceService,
            UserRepository userRepository,
            FamilyNotificationService familyNotificationService,
            SimpMessagingTemplate messagingTemplate,
            MedicalProfileRepository medicalProfileRepository,
            AmbulanceRequestRepository ambulanceRequestRepository
    ) {
        this(emergencyRepository, eventRepository, hospitalRepository, departmentRepository,
                recommendationService, doctorRepository, null, ambulanceRepository, ambulanceService,
                userRepository, familyNotificationService, messagingTemplate, medicalProfileRepository,
                ambulanceRequestRepository, null);
    }

    @Autowired
    public EmergencyWorkflowService(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            @Autowired(required = false) DoctorAssessmentRepository doctorAssessmentRepository,
            AmbulanceRepository ambulanceRepository,
            AmbulanceService ambulanceService,
            UserRepository userRepository,
            FamilyNotificationService familyNotificationService,
            SimpMessagingTemplate messagingTemplate,
            MedicalProfileRepository medicalProfileRepository,
            @Autowired(required = false) AmbulanceRequestRepository ambulanceRequestRepository,
            @Autowired(required = false) HospitalAssignmentRepository hospitalAssignmentRepository
    ) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.recommendationService = recommendationService;
        this.doctorRepository = doctorRepository;
        this.doctorAssessmentRepository = doctorAssessmentRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.ambulanceService = ambulanceService;
        this.userRepository = userRepository;
        this.familyNotificationService = familyNotificationService;
        this.messagingTemplate = messagingTemplate;
        this.medicalProfileRepository = medicalProfileRepository;
        this.ambulanceRequestRepository = ambulanceRequestRepository;
        this.hospitalAssignmentRepository = hospitalAssignmentRepository;
    }

    public EmergencyRequest initiateAutomaticEmergency(String patientUid, Double hr, Double spo2, Double temp, Double lat, Double lng, RiskResult risk) {
        // Step 1: DETECTED
        EmergencyRequest request = new EmergencyRequest();
        request.setPatientUid(patientUid);
        request.setLatitude(lat != null ? lat : 12.9716);
        request.setLongitude(lng != null ? lng : 77.5946);
        request.setSymptoms("Automated Triage");
        request.setSymptomDescription("AI Alert: " + (risk != null ? risk.getExplanation() : "Abnormal vitals"));
        request.setRiskScore(risk != null ? risk.getRiskScore() : 85);
        request.setSeverity(risk != null ? risk.getSeverity() : "CRITICAL");
        request.setDetectedVitals(String.format("HR: %.0f, SpO2: %.0f, Temp: %.1f",
                hr != null ? hr : 75.0, spo2 != null ? spo2 : 98.0, temp != null ? temp : 36.6));
        request.setCreatedAt(LocalDateTime.now());
        request.setStatus("DETECTED");
        request.setRequiresAmbulance(null); // Ambulance decision pending clinical assessment by doctor/hospital staff
        emergencyRepository.save(request);

        logEvent(request.getId(), "DETECTED", "Abnormal vitals detected: " + request.getDetectedVitals() + " (Risk Score: " + (risk != null ? risk.getRiskScore() : 85) + ")");
        broadcastWorkflowUpdate(request, "DETECTED");

        // Step 2: Classify department
        String department = classifyDepartment(patientUid);
        request.setRequiredDepartment(department);

        // Step 3: Rank & Assign Nearest Suitable Hospital
        List<HospitalRecommendation> recommendations = recommendationService.getRecommendations(request.getLatitude(), request.getLongitude(), department);
        if (!recommendations.isEmpty()) {
            HospitalRecommendation bestRec = recommendations.get(0);
            Hospital hospital = bestRec.getHospital();
            request.setHospitalId(hospital.getId());
            request.setStatus("PENDING_HOSPITAL_ACCEPTANCE");
            emergencyRepository.save(request);

            if (hospitalAssignmentRepository != null) {
                HospitalAssignment assignment = new HospitalAssignment(request.getId(), hospital.getId());
                hospitalAssignmentRepository.save(assignment);
            }

            logEvent(request.getId(), "PENDING_HOSPITAL_ACCEPTANCE", "Emergency request routed to nearest hospital: " + hospital.getName() + " (" + bestRec.getReason() + ")");
        } else {
            request.setStatus("SEARCHING_HOSPITAL");
            emergencyRepository.save(request);
            logEvent(request.getId(), "SEARCHING_HOSPITAL", "No suitable hospital found.");
        }
        broadcastWorkflowUpdate(request, request.getStatus());

        // Step 4: Family member notifications
        familyNotificationService.sendFamilyNotification(
                request,
                request.getDetectedVitals(),
                "Awaiting Hospital Acceptance",
                request.getHospitalId() != null ? getHospitalName(request.getHospitalId()) : "TBD"
        );
        logEvent(request.getId(), "FAMILY_NOTIFIED", "Family members notified of emergency status.");
        broadcastWorkflowUpdate(request, "FAMILY_NOTIFIED");

        // NOTE: Hospital MUST accept or reject before doctor is assigned or ambulance is dispatched.
        return request;
    }

    public synchronized EmergencyRequest acceptHospitalEmergency(Long emergencyId, Long hospitalId) {
        EmergencyRequest request = emergencyRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency request not found: " + emergencyId));

        if (request.getHospitalId() == null || !request.getHospitalId().equals(hospitalId)) {
            throw new IllegalArgumentException("Emergency is not assigned to this hospital.");
        }

        // Verify status is pending hospital acceptance
        boolean isPendingStatus = "PENDING_HOSPITAL_ACCEPTANCE".equals(request.getStatus())
                || "HOSPITAL_ASSIGNED".equals(request.getStatus())
                || "NEXT_HOSPITAL_REQUESTED".equals(request.getStatus())
                || "DETECTED".equals(request.getStatus());

        if (!isPendingStatus) {
            throw new IllegalStateException("Emergency is no longer pending acceptance. Current status: " + request.getStatus());
        }

        if (hospitalAssignmentRepository != null) {
            Optional<HospitalAssignment> pendingOpt = hospitalAssignmentRepository.findPendingByEmergencyId(emergencyId);
            if (pendingOpt.isPresent()) {
                HospitalAssignment ha = pendingOpt.get();
                if (!ha.getHospitalId().equals(hospitalId)) {
                    throw new IllegalStateException("Assignment belongs to another hospital.");
                }
                ha.setStatus("ACCEPTED");
                ha.setRespondedAt(LocalDateTime.now());
                hospitalAssignmentRepository.save(ha);
            } else if (hospitalAssignmentRepository.existsByEmergencyIdAndStatusIn(emergencyId, List.of("ACCEPTED"))) {
                throw new IllegalStateException("Emergency has already been accepted by a hospital.");
            }
        }

        request.setStatus("HOSPITAL_ACCEPTED");
        request.setAcceptedAt(LocalDateTime.now());
        emergencyRepository.save(request);

        // Consume hospital bed capacity
        hospitalRepository.findById(hospitalId).ifPresent(h -> {
            h.setAvailableBeds(Math.max(0, h.getAvailableBeds() - 1));
            hospitalRepository.save(h);
        });

        logEvent(emergencyId, "HOSPITAL_ACCEPTED", "Hospital accepted the emergency request.");
        broadcastWorkflowUpdate(request, "HOSPITAL_ACCEPTED");

        // Assign Doctor
        assignDoctor(request);
        broadcastWorkflowUpdate(request, "DOCTOR_ASSIGNED");

        // Notify family
        familyNotificationService.sendFamilyNotification(
                request,
                request.getDetectedVitals(),
                "Hospital Accepted - Doctor Assigned",
                getHospitalName(hospitalId)
        );

        return request;
    }

    public synchronized EmergencyRequest rejectHospitalEmergency(Long emergencyId, Long hospitalId, String reason) {
        EmergencyRequest request = emergencyRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency request not found: " + emergencyId));

        if (request.getHospitalId() == null || !request.getHospitalId().equals(hospitalId)) {
            throw new IllegalArgumentException("Emergency is not assigned to this hospital.");
        }

        boolean isPendingStatus = "PENDING_HOSPITAL_ACCEPTANCE".equals(request.getStatus())
                || "HOSPITAL_ASSIGNED".equals(request.getStatus())
                || "NEXT_HOSPITAL_REQUESTED".equals(request.getStatus())
                || "DETECTED".equals(request.getStatus());

        if (!isPendingStatus) {
            throw new IllegalStateException("Emergency is not in a pending state to be rejected. Current status: " + request.getStatus());
        }

        if (hospitalAssignmentRepository != null) {
            Optional<HospitalAssignment> pendingOpt = hospitalAssignmentRepository.findPendingByEmergencyId(emergencyId);
            if (pendingOpt.isPresent()) {
                HospitalAssignment ha = pendingOpt.get();
                ha.setStatus("REJECTED");
                ha.setReason(reason != null ? reason : "Capacity full / unable to accept");
                ha.setRespondedAt(LocalDateTime.now());
                hospitalAssignmentRepository.save(ha);
            }
        }

        request.setStatus("HOSPITAL_REJECTED");
        emergencyRepository.save(request);
        String rejReason = (reason != null && !reason.trim().isEmpty()) ? reason : "Hospital unable to accommodate patient";
        logEvent(emergencyId, "HOSPITAL_REJECTED", "Hospital rejected the emergency request. Reason: " + rejReason);
        broadcastWorkflowUpdate(request, "HOSPITAL_REJECTED");

        // Fallback: Identify next nearest suitable hospital
        List<Long> rejectedHospitalIds = new ArrayList<>();
        if (hospitalAssignmentRepository != null) {
            rejectedHospitalIds = hospitalAssignmentRepository.findByEmergencyId(emergencyId).stream()
                    .map(HospitalAssignment::getHospitalId)
                    .collect(Collectors.toList());
        }
        if (!rejectedHospitalIds.contains(hospitalId)) {
            rejectedHospitalIds.add(hospitalId);
        }

        final List<Long> excluded = rejectedHospitalIds;
        List<HospitalRecommendation> recs = recommendationService.getRecommendations(
                request.getLatitude(), request.getLongitude(), request.getRequiredDepartment()
        );

        Hospital nextHospital = null;
        HospitalRecommendation nextRec = null;
        for (HospitalRecommendation rec : recs) {
            if (rec.getHospital() != null && !excluded.contains(rec.getHospital().getId())) {
                nextHospital = rec.getHospital();
                nextRec = rec;
                break;
            }
        }

        if (nextHospital != null) {
            request.setHospitalId(nextHospital.getId());
            request.setStatus("NEXT_HOSPITAL_REQUESTED");
            emergencyRepository.save(request);
            logEvent(emergencyId, "NEXT_HOSPITAL_REQUESTED", "Re-routing emergency to next suitable hospital: " + nextHospital.getName() + " (" + nextRec.getReason() + ")");
            broadcastWorkflowUpdate(request, "NEXT_HOSPITAL_REQUESTED");

            request.setStatus("PENDING_HOSPITAL_ACCEPTANCE");
            emergencyRepository.save(request);

            if (hospitalAssignmentRepository != null) {
                HospitalAssignment nextAssignment = new HospitalAssignment(emergencyId, nextHospital.getId());
                hospitalAssignmentRepository.save(nextAssignment);
            }

            broadcastWorkflowUpdate(request, "PENDING_HOSPITAL_ACCEPTANCE");
            familyNotificationService.sendFamilyNotification(
                    request,
                    request.getDetectedVitals(),
                    "Re-routed to " + nextHospital.getName(),
                    nextHospital.getName()
            );
        } else {
            // No fallback hospital available
            request.setStatus("HOSPITAL_REJECTED");
            emergencyRepository.save(request);
            logEvent(emergencyId, "NO_HOSPITAL_AVAILABLE", "All nearby hospitals have rejected or are unavailable.");
            broadcastWorkflowUpdate(request, "HOSPITAL_REJECTED");
            familyNotificationService.sendFamilyNotification(
                    request,
                    request.getDetectedVitals(),
                    "Emergency rejected by nearest hospital. No alternative hospital available.",
                    "None"
            );
        }

        // Do not assign ambulance or notify drivers merely because a hospital rejected
        return request;
    }

    public EmergencyRequest setAmbulanceDecision(Long emergencyId, boolean requiresAmbulance) {
        EmergencyRequest request = emergencyRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency request not found: " + emergencyId));

        if (requiresAmbulance) {
            request.setAmbulanceDecision("REQUIRED");
            dispatchAmbulance(request);
        } else {
            request.setAmbulanceDecision("NOT_REQUIRED");
            markAmbulanceNotRequired(request);
        }
        return request;
    }

    public EmergencyRequest setAmbulanceDecision(Long emergencyId, String decision) {
        EmergencyRequest request = emergencyRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency request not found: " + emergencyId));

        if ("REQUIRED".equalsIgnoreCase(decision)) {
            request.setAmbulanceDecision("REQUIRED");
            dispatchAmbulance(request);
        } else if ("NOT_REQUIRED".equalsIgnoreCase(decision)) {
            request.setAmbulanceDecision("NOT_REQUIRED");
            markAmbulanceNotRequired(request);
        } else {
            request.setAmbulanceDecision("PENDING");
            request.setRequiresAmbulance(null);
            emergencyRepository.save(request);
            broadcastWorkflowUpdate(request, request.getStatus());
        }
        return request;
    }

    public void dispatchAmbulance(EmergencyRequest request) {
        request.setRequiresAmbulance(true);
        request.setStatus("AMBULANCE_REQUESTED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_REQUESTED", "Emergency ambulance dispatch requested by medical staff.");
        broadcastWorkflowUpdate(request, "AMBULANCE_REQUESTED");

        // Use Uber-style ambulance request system
        ambulanceService.requestNearestAmbulance(request);
    }

    public void markAmbulanceNotRequired(EmergencyRequest request) {
        request.setRequiresAmbulance(false);
        request.setStatus("AMBULANCE_NOT_REQUIRED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_NOT_REQUIRED", "Ambulance assessed as not required for this emergency.");
        broadcastWorkflowUpdate(request, "AMBULANCE_NOT_REQUIRED");
    }

    public EmergencyRequest resolveEmergency(Long id) {
        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isEmpty()) {
            throw new IllegalArgumentException("Emergency request not found: " + id);
        }
        EmergencyRequest req = reqOpt.get();
        if ("RESOLVED".equalsIgnoreCase(req.getStatus()) || "COMPLETED".equalsIgnoreCase(req.getStatus())) {
            throw new IllegalStateException("Emergency is already resolved");
        }
        req.setStatus("RESOLVED");
        req.setCompletedAt(LocalDateTime.now());
        emergencyRepository.save(req);

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
        ambulanceRepository.findByCurrentEmergencyId(id).ifPresent(amb -> {
            amb.setStatus("AVAILABLE");
            amb.setCurrentEmergencyId(null);
            ambulanceRepository.save(amb);
        });
        for (Ambulance amb : ambulanceRepository.findByStatusIn(List.of("REQUESTED", "ACCEPTED", "DISPATCHED", "EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"))) {
            if (id.equals(amb.getCurrentEmergencyId())) {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            }
        }

        // Complete any pending/accepted ambulance requests
        if (ambulanceRequestRepository != null) {
            for (AmbulanceRequest ar : ambulanceRequestRepository.findByEmergencyIdAndStatusIn(id, List.of("PENDING", "ACCEPTED"))) {
                ar.setStatus("COMPLETED");
                ambulanceRequestRepository.save(ar);
            }
        }

        // Release hospital capacity
        if (req.getHospitalId() != null) {
            hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> {
                h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                hospitalRepository.save(h);
            });
        }

        logEvent(id, "RESOLVED", "Emergency resolved successfully. Resources released.");
        broadcastWorkflowUpdate(req, "RESOLVED");
        return req;
    }

    public void cancelEmergency(Long id) {
        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isPresent()) {
            EmergencyRequest req = reqOpt.get();
            req.setStatus("CANCELLED");
            req.setCancelled(true);
            req.setCompletedAt(LocalDateTime.now());
            emergencyRepository.save(req);

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
            for (Ambulance amb : ambulanceRepository.findByStatusIn(List.of("REQUESTED", "ACCEPTED"))) {
                if (id.equals(amb.getCurrentEmergencyId())) {
                    amb.setStatus("AVAILABLE");
                    amb.setCurrentEmergencyId(null);
                    ambulanceRepository.save(amb);
                }
            }

            // Release hospital capacity
            if (req.getHospitalId() != null) {
                hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> {
                    h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                    h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                    hospitalRepository.save(h);
                });
            }

            logEvent(id, "CANCELLED", "Emergency cancelled.");
            broadcastWorkflowUpdate(req, "CANCELLED");
        }
    }

    public void onAmbulanceAccepted(EmergencyRequest request, Long ambulanceId) {
        request.setAmbulanceId(ambulanceId);
        request.setStatus("AMBULANCE_ACCEPTED");
        request.setAmbulanceDispatched(true);
        emergencyRepository.save(request);

        logEvent(request.getId(), "AMBULANCE_ACCEPTED", "Ambulance accepted and dispatched.");
        broadcastWorkflowUpdate(request, "AMBULANCE_ACCEPTED");
    }

    public void onAmbulanceEnRoute(EmergencyRequest request) {
        request.setStatus("AMBULANCE_DISPATCHED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_DISPATCHED", "Ambulance en route to patient.");
        broadcastWorkflowUpdate(request, "AMBULANCE_DISPATCHED");
    }

    public void onArrivedAtPatient(EmergencyRequest request) {
        request.setStatus("ARRIVED_AT_PATIENT");
        emergencyRepository.save(request);
        logEvent(request.getId(), "ARRIVED_AT_PATIENT", "Ambulance arrived at patient location.");
        broadcastWorkflowUpdate(request, "ARRIVED_AT_PATIENT");
    }

    public void onPatientPickedUp(EmergencyRequest request) {
        request.setStatus("PATIENT_PICKED_UP");
        emergencyRepository.save(request);
        logEvent(request.getId(), "PATIENT_PICKED_UP", "Patient picked up by ambulance.");
        broadcastWorkflowUpdate(request, "PATIENT_PICKED_UP");
    }

    public void onEnRouteToHospital(EmergencyRequest request) {
        request.setStatus("EN_ROUTE_TO_HOSPITAL");
        emergencyRepository.save(request);
        logEvent(request.getId(), "EN_ROUTE_TO_HOSPITAL", "Ambulance en route to hospital.");
        broadcastWorkflowUpdate(request, "EN_ROUTE_TO_HOSPITAL");
    }

    public void onArrivedAtHospital(EmergencyRequest request) {
        request.setStatus("ARRIVED_AT_HOSPITAL");
        emergencyRepository.save(request);
        logEvent(request.getId(), "ARRIVED_AT_HOSPITAL", "Ambulance arrived at hospital with patient.");
        broadcastWorkflowUpdate(request, "ARRIVED_AT_HOSPITAL");
    }

    private void assignDoctor(EmergencyRequest request) {
        if (request.getHospitalId() == null) {
            request.setStatus("DOCTOR_ASSIGNED");
            request.setDoctorId(-1L);
            request.setAssignedAt(LocalDateTime.now());
            emergencyRepository.save(request);
            logEvent(request.getId(), "DOCTOR_ASSIGNED", "No hospital assigned. Assigned to emergency duty team.");
            return;
        }

        // Find doctors in the required department, on duty, available for emergency
        // Consider specialization, duty status, AND workload (fewest active emergencies)
        List<Doctor> deptDoctors = doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(
                request.getHospitalId(), request.getRequiredDepartment(), true, true);

        Doctor assignedDoc = null;
        if (!deptDoctors.isEmpty()) {
            // Sort by workload (active emergency count) ascending
            assignedDoc = deptDoctors.stream()
                    .min(Comparator.comparingLong(d -> countActiveEmergenciesForDoctor(d.getId())))
                    .orElse(deptDoctors.get(0));
        } else {
            // Fallback: any available doctor on duty at the hospital
            List<Doctor> anyAvailable = doctorRepository.findByHospitalIdAndOnDuty(request.getHospitalId(), true)
                    .stream()
                    .filter(Doctor::getAvailableForEmergency)
                    .toList();
            if (!anyAvailable.isEmpty()) {
                assignedDoc = anyAvailable.stream()
                        .min(Comparator.comparingLong(d -> countActiveEmergenciesForDoctor(d.getId())))
                        .orElse(anyAvailable.get(0));
            }
        }

        if (assignedDoc != null) {
            assignedDoc.setAvailableForEmergency(false);
            doctorRepository.save(assignedDoc);
            request.setDoctorId(assignedDoc.getId());
            request.setStatus("DOCTOR_ASSIGNED");
            request.setAssignedAt(LocalDateTime.now());
            emergencyRepository.save(request);

            // Consume doctor capacity
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                h.setAvailableDoctors(Math.max(0, h.getAvailableDoctors() - 1));
                hospitalRepository.save(h);
            });

            logEvent(request.getId(), "DOCTOR_ASSIGNED", "Doctor " + assignedDoc.getName() + " (" + assignedDoc.getSpecialization() + ") assigned.");

            // Create doctor assessment task
            createDoctorAssessment(request, assignedDoc.getId());
        } else {
            // No eligible doctor available - mark as pending and notify hospital
            request.setStatus("DOCTOR_PENDING");
            request.setDoctorId(null);
            emergencyRepository.save(request);
            logEvent(request.getId(), "DOCTOR_PENDING", "No eligible doctor available in " + request.getRequiredDepartment() + " or hospital staff. Hospital notified for manual assignment.");

            // Notify hospital staff about pending doctor assignment
            if (request.getHospitalId() != null) {
                Map<String, Object> payload = new HashMap<>();
                payload.put("type", "DOCTOR_PENDING");
                payload.put("emergencyId", request.getId());
                payload.put("hospitalId", request.getHospitalId());
                payload.put("requiredDepartment", request.getRequiredDepartment());
                payload.put("message", "No eligible doctor available for emergency SOS-" + request.getId() + ". Please assign a doctor manually.");
                messagingTemplate.convertAndSend("/topic/hospital/" + request.getHospitalId() + "/doctor-pending", (Object) payload);
            }
        }
    }

    private long countActiveEmergenciesForDoctor(Long doctorId) {
        if (doctorId == null) return Long.MAX_VALUE;
        return emergencyRepository.countByDoctorIdAndStatusIn(doctorId, List.of(
                "HOSPITAL_ACCEPTED", "DOCTOR_ASSIGNED", "FAMILY_NOTIFIED", "AMBULANCE_REQUESTED",
                "AMBULANCE_ACCEPTED", "AMBULANCE_DISPATCHED", "EN_ROUTE_TO_PATIENT",
                "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"
        ));
    }

    private void createDoctorAssessment(EmergencyRequest request, Long doctorId) {
        if (doctorAssessmentRepository == null || doctorId == null || doctorId <= 0) {
            return;
        }

        // Check if assessment already exists for this emergency
        Optional<DoctorAssessment> existing = doctorAssessmentRepository.findByEmergencyId(request.getId());
        if (existing.isPresent()) {
            return; // Assessment already created
        }

        DoctorAssessment assessment = new DoctorAssessment(request.getId(), doctorId);
        doctorAssessmentRepository.save(assessment);

        logEvent(request.getId(), "ASSESSMENT_CREATED", "Doctor assessment task created for Dr. ID: " + doctorId);

        // Notify the assigned doctor via WebSocket
        notifyDoctorOfAssessment(assessment, request);
    }

    private void notifyDoctorOfAssessment(DoctorAssessment assessment, EmergencyRequest request) {
        if (messagingTemplate == null) {
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "ASSESSMENT_CREATED");
        payload.put("assessmentId", assessment.getId());
        payload.put("emergencyId", assessment.getEmergencyId());
        payload.put("doctorId", assessment.getDoctorId());
        payload.put("patientUid", request.getPatientUid());
        payload.put("patientName", getPatientName(request.getPatientUid()));
        payload.put("severity", request.getSeverity());
        payload.put("riskScore", request.getRiskScore());
        payload.put("detectedVitals", request.getDetectedVitals());
        payload.put("symptoms", request.getSymptoms());
        payload.put("symptomDescription", request.getSymptomDescription());
        payload.put("requiredDepartment", request.getRequiredDepartment());
        payload.put("hospitalId", request.getHospitalId());
        payload.put("hospitalName", getHospitalName(request.getHospitalId()));
        payload.put("acceptedAt", request.getAcceptedAt());
        payload.put("latitude", request.getLatitude());
        payload.put("longitude", request.getLongitude());
        payload.put("createdAt", assessment.getCreatedAt());

        // Send to doctor's personal topic
        messagingTemplate.convertAndSend("/topic/doctor/" + assessment.getDoctorId() + "/assessments", (Object) payload);

        // Also send to general doctor emergencies topic
        messagingTemplate.convertAndSend("/topic/doctor/emergencies", (Object) payload);
    }

    private String classifyDepartment(String patientUid) {
        Optional<MedicalProfile> profileOpt = medicalProfileRepository.findByUserUid(patientUid);
        if (profileOpt.isPresent()) {
            MedicalProfile profile = profileOpt.get();
            if (Boolean.TRUE.equals(profile.getChestPain()) || (profile.getPreviousHeartProblems() != null && profile.getPreviousHeartProblems().toLowerCase().contains("heart"))) {
                return "Cardiology";
            }
            if (Boolean.TRUE.equals(profile.getShortnessOfBreath()) || Boolean.TRUE.equals(profile.getAsthma())) {
                return "Pulmonology";
            }
            if (Boolean.TRUE.equals(profile.getSeizures()) || Boolean.TRUE.equals(profile.getDizziness())) {
                return "Neurology";
            }
            if (Boolean.TRUE.equals(profile.getAbdominalPain())) {
                return "General Medicine";
            }
        }
        return "Emergency";
    }

    private void logEvent(Long emergencyId, String status, String description) {
        EmergencyEvent event = new EmergencyEvent(emergencyId, status, description);
        eventRepository.save(event);
    }

    private void broadcastWorkflowUpdate(EmergencyRequest request, String status) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("emergencyId", request.getId());
        payload.put("status", request.getStatus());
        payload.put("patientUid", request.getPatientUid());
        payload.put("patientName", getPatientName(request.getPatientUid()));
        payload.put("riskScore", request.getRiskScore());
        payload.put("severity", request.getSeverity());
        payload.put("hospitalId", request.getHospitalId());
        payload.put("doctorId", request.getDoctorId());
        payload.put("ambulanceId", request.getAmbulanceId());
        payload.put("requiresAmbulance", request.getRequiresAmbulance());
        payload.put("ambulanceDecision", request.getAmbulanceDecision());
        payload.put("latitude", request.getLatitude());
        payload.put("longitude", request.getLongitude());
        payload.put("createdAt", request.getCreatedAt());
        payload.put("updatedAt", LocalDateTime.now());

        Object wsPayload = payload;

        // Broadcast to emergency-specific topic
        messagingTemplate.convertAndSend("/topic/emergency/" + request.getId(), wsPayload);

        // Broadcast to general emergency updates and hospital queue refresh
        messagingTemplate.convertAndSend("/topic/emergency-updates", wsPayload);
        messagingTemplate.convertAndSend("/topic/hospital-queue-refresh", "refresh");

        // Broadcast to hospital topic
        if (request.getHospitalId() != null) {
            messagingTemplate.convertAndSend("/topic/hospital/" + request.getHospitalId() + "/emergencies", wsPayload);
            messagingTemplate.convertAndSend("/topic/hospital/assignments", wsPayload);
        }

        // Broadcast to doctor topic
        if (request.getDoctorId() != null && request.getDoctorId() > 0) {
            messagingTemplate.convertAndSend("/topic/doctor/" + request.getDoctorId() + "/emergencies", wsPayload);
            userRepository.findByDoctorId(request.getDoctorId()).ifPresent(u -> {
                if (!u.getId().equals(request.getDoctorId())) {
                    messagingTemplate.convertAndSend("/topic/doctor/" + u.getId() + "/emergencies", wsPayload);
                }
            });
        }

        // Broadcast to ambulance topic
        if (request.getAmbulanceId() != null) {
            messagingTemplate.convertAndSend("/topic/ambulance/" + request.getAmbulanceId(), wsPayload);
        }

        // Broadcast to family/patient topic
        messagingTemplate.convertAndSend("/topic/family-notifications/" + request.getPatientUid(), wsPayload);
    }

    private String getHospitalName(Long hospitalId) {
        if (hospitalId == null) return "TBD";
        return hospitalRepository.findById(hospitalId)
                .map(Hospital::getName)
                .orElse("TBD");
    }

    private String getPatientName(String patientUid) {
        return userRepository.findByUid(patientUid)
                .map(User::getFullName)
                .orElse("Unknown Patient");
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