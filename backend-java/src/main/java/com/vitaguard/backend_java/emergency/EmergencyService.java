package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
public class EmergencyService {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final MedicalProfileRepository medicalProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final com.vitaguard.backend_java.ambulance.AmbulanceService ambulanceService;
    private final RestTemplate restTemplate = new RestTemplate();

    public EmergencyService(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            MedicalProfileRepository medicalProfileRepository,
            SimpMessagingTemplate messagingTemplate,
            @org.springframework.context.annotation.Lazy com.vitaguard.backend_java.ambulance.AmbulanceService ambulanceService
    ) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.medicalProfileRepository = medicalProfileRepository;
        this.messagingTemplate = messagingTemplate;
        this.ambulanceService = ambulanceService;
    }

    public EmergencyRequest triggerSos(String patientUid, Double lat, Double lng, String symptoms, String description) {
        return triggerSos(patientUid, lat, lng, symptoms, description, true);
    }

    public EmergencyRequest triggerSos(String patientUid, Double lat, Double lng, String symptoms, String description, Boolean requiresAmbulance) {
        // 1. Determine Department
        String department = classifyDepartment(patientUid, symptoms);

        // 2. Find and Rank Hospitals
        Hospital matchedHospital = matchHospital(lat, lng, department);

        EmergencyRequest request = new EmergencyRequest(patientUid, lat, lng, symptoms, description);
        if (requiresAmbulance != null) {
            request.setRequiresAmbulance(requiresAmbulance);
        }
        request.setRequiredDepartment(department);
        request.setHospitalId(matchedHospital != null ? matchedHospital.getId() : null);
        request.setStatus("DETECTED");

        // Set triage severity & risk score for patient-triggered emergency
        String lSymptoms = symptoms != null ? symptoms.toLowerCase() : "";
        boolean isCritical = lSymptoms.contains("chest pain") || lSymptoms.contains("cardiac") || lSymptoms.contains("heart")
                || lSymptoms.contains("unconscious") || lSymptoms.contains("stroke") || lSymptoms.contains("accident")
                || lSymptoms.contains("collapse") || lSymptoms.contains("shock") || lSymptoms.contains("trauma");
        request.setSeverity(isCritical ? "CRITICAL" : "HIGH");
        request.setRiskScore(isCritical ? 90 : 75);
        if (request.getDetectedVitals() == null) {
            request.setDetectedVitals(isCritical ? "HR: 138 bpm, SpO2: 89%, BP: 145/95" : "HR: 96 bpm, SpO2: 95%, BP: 125/80");
        }

        emergencyRepository.save(request);

        // Log DETECTED event
        logEvent(request.getId(), "DETECTED", "Emergency request created by patient");
        broadcastWorkflowUpdate(request, "DETECTED");

        // 3. Assign Hospital
        if (matchedHospital != null) {
            request.setStatus("HOSPITAL_ASSIGNED");
            emergencyRepository.save(request);
            
            // Consume hospital capacity
            matchedHospital.setAvailableBeds(Math.max(0, matchedHospital.getAvailableBeds() - 1));
            hospitalRepository.save(matchedHospital);
            
            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "Hospital assigned: " + matchedHospital.getName());
            broadcastWorkflowUpdate(request, "HOSPITAL_ASSIGNED");
        } else {
            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "No suitable hospital found");
            broadcastWorkflowUpdate(request, "HOSPITAL_ASSIGNED");
        }

        return request;
    }

    public EmergencyRequest acceptEmergency(Long sosId, Long hospitalId) {
        EmergencyRequest request = emergencyRepository.findById(sosId)
                .orElseThrow(() -> new IllegalArgumentException("SOS event not found"));

        // Verify hospital match
        if (!hospitalId.equals(request.getHospitalId())) {
            throw new IllegalArgumentException("Emergency does not belong to this hospital");
        }

        // Verify status is still pending acceptance
        if (!"HOSPITAL_ASSIGNED".equals(request.getStatus())) {
            throw new IllegalArgumentException("Emergency is no longer pending acceptance. Current status: " + request.getStatus());
        }

        request.setStatus("HOSPITAL_ACCEPTED");
        request.setAcceptedAt(LocalDateTime.now());
        emergencyRepository.save(request);

        // Log timeline event
        logEvent(request.getId(), "HOSPITAL_ACCEPTED", "Hospital accepted the emergency request");

        // Assign Doctor
        assignDoctor(request);

        // Assign Ambulance if required
        if (Boolean.TRUE.equals(request.getRequiresAmbulance())) {
            assignAmbulance(request);
        } else {
            request.setStatus("AMBULANCE_NOT_REQUIRED");
            emergencyRepository.save(request);
            logEvent(request.getId(), "AMBULANCE_NOT_REQUIRED", "Ambulance not required for this emergency");
        }

        // Broadcast to all relevant topics
        broadcastWorkflowUpdate(request, "HOSPITAL_ACCEPTED");

        return request;
    }

    private void logEvent(Long emergencyId, String status, String description) {
        EmergencyEvent event = new EmergencyEvent(emergencyId, status, description);
        eventRepository.save(event);
    }

    private String classifyDepartment(String patientUid, String symptoms) {
        if (symptoms == null) return "Emergency";
        String lSymptoms = symptoms.toLowerCase();

        boolean hasHeartHistory = false;
        Optional<MedicalProfile> profileOpt = medicalProfileRepository.findByUserUid(patientUid);
        if (profileOpt.isPresent()) {
            String heartHistory = profileOpt.get().getPreviousHeartProblems().toLowerCase();
            hasHeartHistory = heartHistory.contains("heart") || heartHistory.contains("cardiac") || heartHistory.contains("yes");
        }

        if (lSymptoms.contains("chest pain") || lSymptoms.contains("chest_pain") || lSymptoms.contains("cardiac")) {
            return hasHeartHistory ? "Cardiology" : "Emergency";
        }
        if (lSymptoms.contains("breathing difficulty") || lSymptoms.contains("breath")) {
            return "Pulmonology";
        }
        if (lSymptoms.contains("accident") || lSymptoms.contains("injury") || lSymptoms.contains("bleeding")) {
            return "Trauma";
        }
        if (lSymptoms.contains("seizure") || lSymptoms.contains("consciousness")) {
            return "Neurology";
        }
        if (lSymptoms.contains("bone") || lSymptoms.contains("fracture")) {
            return "Orthopedics";
        }
        if (lSymptoms.contains("fever")) {
            return "General Medicine";
        }

        return "Emergency";
    }

    private Hospital matchHospital(Double patientLat, Double patientLng, String departmentName) {
        List<Hospital> hospitals = hospitalRepository.findAll();
        Hospital bestHospital = null;
        double minDistance = Double.MAX_VALUE;

        for (Hospital hospital : hospitals) {
            // Check if department is available and accepting patients
            Optional<HospitalDepartment> depOpt = departmentRepository.findByHospitalIdAndName(hospital.getId(), departmentName);
            if (depOpt.isPresent()) {
                HospitalDepartment dep = depOpt.get();
                if (dep.getAvailable() && dep.getEmergencyService() && dep.getAcceptingPatients()) {
                    double dist = calculateDistance(patientLat, patientLng, hospital.getLat(), hospital.getLng());
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestHospital = hospital;
                    }
                }
            }
        }

        // Fallback: If no hospital matches department capability, select closest hospital with an available Emergency Department
        if (bestHospital == null) {
            for (Hospital hospital : hospitals) {
                Optional<HospitalDepartment> depOpt = departmentRepository.findByHospitalIdAndName(hospital.getId(), "Emergency");
                if (depOpt.isPresent() && depOpt.get().getAvailable() && depOpt.get().getAcceptingPatients()) {
                    double dist = calculateDistance(patientLat, patientLng, hospital.getLat(), hospital.getLng());
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestHospital = hospital;
                    }
                }
            }
        }

        return bestHospital;
    }

    private void assignDoctor(EmergencyRequest request) {
        if (request.getHospitalId() == null) {
            request.setStatus("DOCTOR_ASSIGNED");
            request.setDoctorId(-1L);
            emergencyRepository.save(request);
            logEvent(request.getId(), "DOCTOR_ASSIGNED", "No hospital assigned. Assigned to emergency duty team.");
            broadcastWorkflowUpdate(request, "DOCTOR_ASSIGNED");
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
            request.setAssignedAt(LocalDateTime.now());
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
                request.setAssignedAt(LocalDateTime.now());
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
                request.setAssignedAt(LocalDateTime.now());
                emergencyRepository.save(request);
                logEvent(request.getId(), "DOCTOR_ASSIGNED", "Specialist doctor unavailable. Assigned to emergency duty team.");
            }
        }
        broadcastWorkflowUpdate(request, "DOCTOR_ASSIGNED");
    }

    private void assignAmbulance(EmergencyRequest request) {
        // Log AMBULANCE_REQUESTED
        request.setStatus("AMBULANCE_REQUESTED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_REQUESTED", "Emergency ambulance request raised.");
        broadcastWorkflowUpdate(request, "AMBULANCE_REQUESTED");

        if (ambulanceService != null) {
            com.vitaguard.backend_java.ambulance.AmbulanceRequest ambReq = ambulanceService.requestNearestAmbulance(request);
            if (ambReq != null && ambReq.getAmbulanceId() != null) {
                request.setAmbulanceId(ambReq.getAmbulanceId());
                emergencyRepository.save(request);
            }
        }
    }

    private void sendAmbulanceRequestToDriver(Ambulance ambulance, EmergencyRequest request, double distance) {
        if (ambulance.getDriver() == null) return;

        int eta = (int) Math.ceil((distance / 40.0) * 60.0);

        Map<String, Object> payload = new HashMap<>();
        payload.put("requestId", request.getId());
        payload.put("emergencyId", request.getId());
        payload.put("patientName", getPatientName(request.getPatientUid()));
        payload.put("severity", request.getSeverity());
        payload.put("riskScore", request.getRiskScore());
        payload.put("distanceKm", Math.round(distance * 100.0) / 100.0);
        payload.put("etaMinutes", eta);
        payload.put("pickupLat", request.getLatitude());
        payload.put("pickupLng", request.getLongitude());
        payload.put("destinationHospital", getHospitalName(request.getHospitalId()));
        payload.put("status", "PENDING");
        payload.put("requestedAt", LocalDateTime.now());

        Object wsPayload = payload;

        // Send to driver's personal topic
        messagingTemplate.convertAndSend("/topic/ambulance/request/" + ambulance.getDriver().getId(), wsPayload);
        
        // Also send to ambulance topic
        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulance.getId(), wsPayload);
    }

    private String getHospitalName(Long hospitalId) {
        if (hospitalId == null) return "TBD";
        return hospitalRepository.findById(hospitalId)
                .map(Hospital::getName)
                .orElse("TBD");
    }

    private void dispatchAmbulanceSimulation(EmergencyRequest request, Ambulance ambulance) {
        CompletableFuture.runAsync(() -> {
            try {
                request.setStatus("AMBULANCE_EN_ROUTE");
                emergencyRepository.save(request);

                Hospital hospital = hospitalRepository.findById(request.getHospitalId()).orElse(null);
                Double destLat = request.getLatitude();
                Double destLng = request.getLongitude();

                // Fetch route coordinates from OSRM
                List<Double[]> routePoints = fetchRouteWaypoints(
                        ambulance.getLatitude(), ambulance.getLongitude(),
                        destLat, destLng
                );

                // Send immediate live tracking update upon dispatch
                sendLiveTrackingUpdate(request, ambulance.getLatitude(), ambulance.getLongitude(), 0.0, "Dispatched");

                int totalSteps = routePoints.size();
                for (int step = 0; step < totalSteps; step++) {
                    Thread.sleep(3000); // 3-second simulation step

                    Double[] currentPt = routePoints.get(step);
                    ambulance.setLatitude(currentPt[0]);
                    ambulance.setLongitude(currentPt[1]);
                    ambulanceRepository.save(ambulance);

                    // Transition to PICKED_UP midway
                    if (step == totalSteps / 2) {
                        request.setStatus("PATIENT_PICKED_UP");
                        emergencyRepository.save(request);
                    }

                    double remainingMin = (totalSteps - 1 - step) * 3 / 60.0;
                    double progress = (double) (step + 1) / totalSteps;

                    sendLiveTrackingUpdate(request, currentPt[0], currentPt[1], progress, String.format("%.1f min", remainingMin));
                }

                // Arrived at scene/hospital
                request.setStatus("ARRIVED_AT_HOSPITAL");
                request.setCompletedAt(LocalDateTime.now());
                emergencyRepository.save(request);

                // Release ambulance back to hospital position as available
                if (hospital != null) {
                    ambulance.setLatitude(hospital.getLat());
                    ambulance.setLongitude(hospital.getLng());
                }
                ambulance.setStatus("available");
                ambulanceRepository.save(ambulance);

                sendLiveTrackingUpdate(request, ambulance.getLatitude(), ambulance.getLongitude(), 1.0, "ARRIVED");
                broadcastToHospitalCommandCenters();

            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private List<Double[]> fetchRouteWaypoints(Double fromLat, Double fromLng, Double toLat, Double toLng) {
        List<Double[]> pts = new ArrayList<>();
        String url = String.format(Locale.US, "http://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
                fromLng, fromLat, toLng, toLat);

        try {
            Map<String, Object> resp = restTemplate.getForObject(url, Map.class);
            List<Map<String, Object>> routes = (List<Map<String, Object>>) resp.get("routes");
            if (routes != null && !routes.isEmpty()) {
                Map<String, Object> route = routes.get(0);
                Map<String, Object> geom = (Map<String, Object>) route.get("geometry");
                List<List<Double>> coords = (List<List<Double>>) geom.get("coordinates"); // list of [lng, lat]
                if (coords != null && coords.size() >= 2) {
                    // Resample to exactly 15 steps
                    int targetSteps = 15;
                    for (int i = 0; i < targetSteps; i++) {
                        int idx = i * (coords.size() - 1) / (targetSteps - 1);
                        List<Double> coord = coords.get(idx);
                        pts.add(new Double[]{coord.get(1), coord.get(0)}); // [lat, lng]
                    }
                    return pts;
                }
            }
        } catch (Exception e) {
            System.err.println("[OSRM] Failed to load route from OSRM, falling back to straight-line interpolation");
        }

        // Fallback: 15-step straight-line interpolation
        int steps = 15;
        for (int i = 0; i < steps; i++) {
            double fraction = (double) i / (steps - 1);
            double lat = fromLat + (toLat - fromLat) * fraction;
            double lng = fromLng + (toLng - fromLng) * fraction;
            pts.add(new Double[]{lat, lng});
        }
        return pts;
    }

    private void sendLiveTrackingUpdate(EmergencyRequest req, Double ambLat, Double ambLng, Double progress, String eta) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("sosId", req.getId());
        payload.put("status", req.getStatus());
        payload.put("ambulanceLatitude", ambLat);
        payload.put("ambulanceLongitude", ambLng);
        payload.put("progress", progress);
        payload.put("eta", eta);

        hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> payload.put("hospital", h.getName()));
        if (req.getDoctorId() != null && req.getDoctorId() > 0) {
            doctorRepository.findById(req.getDoctorId()).ifPresent(d -> payload.put("doctor", d.getName()));
        } else if (req.getDoctorId() != null && req.getDoctorId() == -1L) {
            payload.put("doctor", "Emergency Team");
        }

        messagingTemplate.convertAndSend("/topic/emergency/" + req.getId(), (Object) payload);
        // Also update command center
        messagingTemplate.convertAndSend("/topic/emergency-updates", (Object) payload);
    }

    private void broadcastToHospitalCommandCenters() {
        messagingTemplate.convertAndSend("/topic/hospital-queue-refresh", "refresh");
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

    public double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
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
