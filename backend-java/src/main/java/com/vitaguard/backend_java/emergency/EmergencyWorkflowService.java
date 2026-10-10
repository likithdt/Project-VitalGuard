package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceRequest;
import com.vitaguard.backend_java.ambulance.AmbulanceRequestRepository;
import com.vitaguard.backend_java.ambulance.AmbulanceService;
import com.vitaguard.backend_java.doctor.Doctor;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@Service
@Transactional
public class EmergencyWorkflowService {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final HospitalRecommendationService recommendationService;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceService ambulanceService;
    private final UserRepository userRepository;
    private final FamilyNotificationService familyNotificationService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MedicalProfileRepository medicalProfileRepository;
    private final AmbulanceRequestRepository ambulanceRequestRepository;

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
                recommendationService, doctorRepository, ambulanceRepository, ambulanceService,
                userRepository, familyNotificationService, messagingTemplate, medicalProfileRepository, null);
    }

    @Autowired
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
            @Autowired(required = false) AmbulanceRequestRepository ambulanceRequestRepository
    ) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.recommendationService = recommendationService;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.ambulanceService = ambulanceService;
        this.userRepository = userRepository;
        this.familyNotificationService = familyNotificationService;
        this.messagingTemplate = messagingTemplate;
        this.medicalProfileRepository = medicalProfileRepository;
        this.ambulanceRequestRepository = ambulanceRequestRepository;
    }

    public EmergencyRequest initiateAutomaticEmergency(String patientUid, Double hr, Double spo2, Double temp, Double lat, Double lng, RiskResult risk) {
        // Step 1: DETECTED
        EmergencyRequest request = new EmergencyRequest();
        request.setPatientUid(patientUid);
        request.setLatitude(lat != null ? lat : 12.9716);
        request.setLongitude(lng != null ? lng : 77.5946);
        request.setSymptoms("Automated Triage");
        request.setSymptomDescription("AI Alert: " + risk.getExplanation());
        request.setRiskScore(risk.getRiskScore());
        request.setSeverity(risk.getSeverity());
        request.setDetectedVitals(String.format("HR: %.0f, SpO2: %.0f, Temp: %.1f", hr, spo2, temp));
        request.setCreatedAt(LocalDateTime.now());
        request.setStatus("DETECTED");
        request.setRequiresAmbulance(risk.getRiskScore() >= 50 || "CRITICAL".equals(risk.getSeverity()) || "HIGH".equals(risk.getSeverity()));
        emergencyRepository.save(request);

        logEvent(request.getId(), "DETECTED", "Abnormal vitals detected: " + request.getDetectedVitals() + " (Risk Score: " + risk.getRiskScore() + ")");
        broadcastWorkflowUpdate(request, "DETECTED");

        // Step 2: Classify department
        String department = classifyDepartment(patientUid);
        request.setRequiredDepartment(department);

        // Step 3: Rank & Assign Hospital
        List<HospitalRecommendation> recommendations = recommendationService.getRecommendations(request.getLatitude(), request.getLongitude(), department);
        if (!recommendations.isEmpty()) {
            HospitalRecommendation bestRec = recommendations.get(0);
            Hospital hospital = bestRec.getHospital();
            request.setHospitalId(hospital.getId());
            request.setStatus("HOSPITAL_ASSIGNED");
            emergencyRepository.save(request);

            // Consume hospital capacity
            hospital.setAvailableBeds(Math.max(0, hospital.getAvailableBeds() - 1));
            hospitalRepository.save(hospital);

            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "Hospital assigned: " + hospital.getName() + " (" + bestRec.getReason() + ")");
        } else {
            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "No suitable hospital found.");
        }
        broadcastWorkflowUpdate(request, "HOSPITAL_ASSIGNED");

        // Step 4: Assign Doctor
        assignDoctor(request);
        broadcastWorkflowUpdate(request, "DOCTOR_ASSIGNED");

        // Step 5: Family member notifications
        familyNotificationService.sendFamilyNotification(
                request,
                request.getDetectedVitals(),
                "Awaiting Dispatch",
                "TBD"
        );
        logEvent(request.getId(), "FAMILY_NOTIFIED", "Family members notified of emergency status.");
        broadcastWorkflowUpdate(request, "FAMILY_NOTIFIED");

        // Step 6: Dispatch Ambulance (only if required)
        if (Boolean.TRUE.equals(request.getRequiresAmbulance())) {
            dispatchAmbulance(request);
        } else {
            request.setStatus("AMBULANCE_NOT_REQUIRED");
            emergencyRepository.save(request);
            logEvent(request.getId(), "AMBULANCE_NOT_REQUIRED", "Ambulance not required for this emergency.");
            broadcastWorkflowUpdate(request, "AMBULANCE_NOT_REQUIRED");
        }

        return request;
    }

    public void dispatchAmbulance(EmergencyRequest request) {
        request.setStatus("AMBULANCE_REQUESTED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_REQUESTED", "Emergency ambulance request raised.");
        broadcastWorkflowUpdate(request, "AMBULANCE_REQUESTED");

        // Use new Uber-style ambulance request system
        ambulanceService.requestNearestAmbulance(request);
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
            emergencyRepository.save(request);
            logEvent(request.getId(), "DOCTOR_ASSIGNED", "No hospital assigned. Assigned to emergency duty team.");
            return;
        }

        List<Doctor> doctors = doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(
                request.getHospitalId(), request.getRequiredDepartment(), true, true);

        if (!doctors.isEmpty()) {
            Doctor doc = doctors.get(0);
            doc.setAvailableForEmergency(false);
            doctorRepository.save(doc);
            request.setDoctorId(doc.getId());
            request.setStatus("DOCTOR_ASSIGNED");
            emergencyRepository.save(request);

            // Consume doctor capacity
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                h.setAvailableDoctors(Math.max(0, h.getAvailableDoctors() - 1));
                hospitalRepository.save(h);
            });

            logEvent(request.getId(), "DOCTOR_ASSIGNED", "Doctor " + doc.getName() + " (" + doc.getSpecialization() + ") assigned.");
        } else {
            // Check any doctor on duty and available at the assigned hospital
            List<Doctor> anyAvailable = doctorRepository.findByHospitalIdAndOnDuty(request.getHospitalId(), true)
                    .stream()
                    .filter(Doctor::getAvailableForEmergency)
                    .toList();
            if (!anyAvailable.isEmpty()) {
                Doctor doc = anyAvailable.get(0);
                doc.setAvailableForEmergency(false);
                doctorRepository.save(doc);
                request.setDoctorId(doc.getId());
                request.setStatus("DOCTOR_ASSIGNED");
                emergencyRepository.save(request);
                hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                    h.setAvailableDoctors(Math.max(0, h.getAvailableDoctors() - 1));
                    hospitalRepository.save(h);
                });
                logEvent(request.getId(), "DOCTOR_ASSIGNED", "Doctor " + doc.getName() + " (" + doc.getSpecialization() + ") assigned from available hospital staff.");
            } else {
                // Assign to general emergency team
                request.setDoctorId(-1L);
                request.setStatus("DOCTOR_ASSIGNED");
                emergencyRepository.save(request);
                logEvent(request.getId(), "DOCTOR_ASSIGNED", "Specialist doctor unavailable. Assigned to emergency duty team.");
            }
        }
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