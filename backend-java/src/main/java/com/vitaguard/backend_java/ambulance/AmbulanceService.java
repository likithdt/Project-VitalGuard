package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class AmbulanceService {

    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceRequestRepository requestRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final EmergencyWorkflowService emergencyWorkflowService;

    // Track pending requests to prevent duplicate acceptance
    private final Map<Long, Long> pendingRequestLocks = new ConcurrentHashMap<>();

    public AmbulanceService(AmbulanceRepository ambulanceRepository,
                            AmbulanceRequestRepository requestRepository,
                            EmergencyRequestRepository emergencyRepository,
                            HospitalRepository hospitalRepository,
                            UserRepository userRepository,
                            SimpMessagingTemplate messagingTemplate,
                            @Lazy EmergencyWorkflowService emergencyWorkflowService) {
        this.ambulanceRepository = ambulanceRepository;
        this.requestRepository = requestRepository;
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
        this.emergencyWorkflowService = emergencyWorkflowService;
    }

    @Transactional
    public AmbulanceRequest requestNearestAmbulance(EmergencyRequest emergency) {
        // Only request ambulance if required
        if (!Boolean.TRUE.equals(emergency.getRequiresAmbulance())) {
            return null;
        }

        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("AVAILABLE").stream()
                .filter(amb -> amb.getDriver() != null)
                .collect(Collectors.toList());
        if (availableAmbulances.isEmpty()) {
            // No ambulances available
            emergency.setStatus("AMBULANCE_UNAVAILABLE");
            emergencyRepository.save(emergency);
            notifyAmbulanceUnavailable(emergency);
            return null;
        }

        // Calculate distances and sort by nearest
        List<AmbulanceDistance> distances = new ArrayList<>();
        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(emergency.getLatitude(), emergency.getLongitude(),
                    amb.getLatitude(), amb.getLongitude());
            int eta = (int) Math.ceil((dist / 40.0) * 60.0); // ~40 km/h average
            distances.add(new AmbulanceDistance(amb, dist, eta));
        }

        distances.sort(Comparator.comparingDouble(AmbulanceDistance::distance));

        // Request the nearest ambulance first
        for (AmbulanceDistance ad : distances) {
            AmbulanceRequest request = createRequest(emergency, ad.ambulance(), ad.distance(), ad.eta());
            if (request != null) {
                // Mark ambulance as REQUESTED
                ad.ambulance().setStatus("REQUESTED");
                ad.ambulance().setCurrentEmergencyId(emergency.getId());
                ambulanceRepository.save(ad.ambulance());

                // Update emergency status
                emergency.setStatus("AMBULANCE_REQUESTED");
                emergencyRepository.save(emergency);

                // Send WebSocket notification to driver
                sendRequestToDriver(ad.ambulance().getDriver(), request, emergency, ad.distance(), ad.eta());

                return request;
            }
        }

        return null;
    }

    private AmbulanceRequest createRequest(EmergencyRequest emergency, Ambulance ambulance, double distance, int eta) {
        // Check if there's already a pending request for this emergency
        if (requestRepository.existsByEmergencyIdAndStatusIn(emergency.getId(),
                List.of("PENDING", "ACCEPTED"))) {
            return null;
        }

        // Do not re-request an ambulance that already has a request (e.g. declined) for this emergency
        if (requestRepository.findByEmergencyIdAndAmbulanceId(emergency.getId(), ambulance.getId()).isPresent()) {
            return null;
        }

        // Clean up any stale requests for this ambulance where the emergency is cancelled or resolved
        List<AmbulanceRequest> existing = requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(), List.of("PENDING", "ACCEPTED"));
        for (AmbulanceRequest ar : existing) {
            Optional<EmergencyRequest> erOpt = emergencyRepository.findById(ar.getEmergencyId());
            if (erOpt.isEmpty() || Boolean.TRUE.equals(erOpt.get().getCancelled()) || "RESOLVED".equals(erOpt.get().getStatus()) || "CANCELLED".equals(erOpt.get().getStatus())) {
                ar.setStatus("RESOLVED".equals(erOpt.map(EmergencyRequest::getStatus).orElse("")) ? "COMPLETED" : "CANCELLED");
                requestRepository.save(ar);
            }
        }

        // Check if ambulance already has an active pending or accepted request
        long activeCount = requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(), List.of("PENDING", "ACCEPTED")).stream()
                .filter(ar -> {
                    Optional<EmergencyRequest> erOpt = emergencyRepository.findById(ar.getEmergencyId());
                    return erOpt.isPresent() && !Boolean.TRUE.equals(erOpt.get().getCancelled()) 
                            && !"RESOLVED".equals(erOpt.get().getStatus()) && !"CANCELLED".equals(erOpt.get().getStatus());
                }).count();
        if (activeCount > 0) {
            return null;
        }

        AmbulanceRequest request = new AmbulanceRequest(emergency.getId(), ambulance.getId(), distance, eta);
        requestRepository.save(request);
        return request;
    }

    private void sendRequestToDriver(User driver, AmbulanceRequest request, EmergencyRequest emergency, double distance, int eta) {
        if (driver == null) return;

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("requestId", request.getId());
        payload.put("emergencyId", emergency.getId());
        payload.put("patientName", getPatientName(emergency.getPatientUid()));
        payload.put("severity", emergency.getSeverity());
        payload.put("riskScore", emergency.getRiskScore());
        payload.put("distanceKm", Math.round(distance * 100.0) / 100.0);
        payload.put("etaMinutes", eta);
        payload.put("pickupLat", emergency.getLatitude());
        payload.put("pickupLng", emergency.getLongitude());
        payload.put("destinationHospital", getHospitalName(emergency.getHospitalId()));
        payload.put("status", "PENDING");
        payload.put("requestedAt", LocalDateTime.now());

        Object wsPayload = payload;

        // Send to driver's personal topic
        messagingTemplate.convertAndSend("/topic/ambulance/request/" + driver.getId(), wsPayload);
        
        // Also send to ambulance topic
        messagingTemplate.convertAndSend("/topic/ambulance/" + request.getAmbulanceId(), wsPayload);
    }

    @Transactional
    public synchronized boolean acceptRequest(Long requestId, Long driverId) {
        AmbulanceRequest request = requestRepository.findById(requestId).orElse(null);
        if (request == null) {
            return false;
        }

        // Check if already accepted or declined
        if (!"PENDING".equals(request.getStatus())) {
            return false;
        }

        // Verify driver owns the ambulance
        Ambulance ambulance = ambulanceRepository.findById(request.getAmbulanceId()).orElse(null);
        User driver = userRepository.findById(driverId).orElse(null);
        boolean isAuthorizedDriver = ambulance != null && (
                (ambulance.getDriver() != null && ambulance.getDriver().getId().equals(driverId))
                || (driver != null && ambulance.getId().equals(driver.getAmbulanceId()))
        );
        if (!isAuthorizedDriver) {
            return false;
        }

        // Check if another request for this emergency was already accepted
        List<AmbulanceRequest> acceptedRequests = requestRepository.findByEmergencyIdAndStatusIn(request.getEmergencyId(),
                List.of("ACCEPTED"));
        if (!acceptedRequests.isEmpty() && !acceptedRequests.get(0).getId().equals(requestId)) {
            // Another ambulance already accepted - decline this one
            request.setStatus("DECLINED");
            request.setRespondedAt(LocalDateTime.now());
            requestRepository.save(request);
            return false;
        }

        // Accept the request
        request.setStatus("ACCEPTED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Update ambulance status
        ambulance.setStatus("ACCEPTED");
        ambulance.setCurrentEmergencyId(request.getEmergencyId());
        ambulanceRepository.save(ambulance);

        // Update emergency
        EmergencyRequest emergency = emergencyRepository.findById(request.getEmergencyId()).orElse(null);
        if (emergency != null) {
            emergency.setAmbulanceId(ambulance.getId());
            emergency.setAmbulanceDispatched(true);
            emergencyRepository.save(emergency);
            
            // Call workflow service to handle status update
            emergencyWorkflowService.onAmbulanceAccepted(emergency, ambulance.getId());
        }

        // Notify all parties
        notifyAmbulanceAccepted(request, ambulance, emergency);

        return true;
    }

    @Transactional
    public synchronized boolean declineRequest(Long requestId, Long driverId) {
        AmbulanceRequest request = requestRepository.findById(requestId).orElse(null);
        if (request == null) {
            return false;
        }

        if (!"PENDING".equals(request.getStatus())) {
            return false;
        }

        Ambulance ambulance = ambulanceRepository.findById(request.getAmbulanceId()).orElse(null);
        User driver = userRepository.findById(driverId).orElse(null);
        boolean isAuthorizedDriver = ambulance != null && (
                (ambulance.getDriver() != null && ambulance.getDriver().getId().equals(driverId))
                || (driver != null && ambulance.getId().equals(driver.getAmbulanceId()))
        );
        if (!isAuthorizedDriver) {
            return false;
        }

        request.setStatus("DECLINED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Return ambulance to AVAILABLE
        ambulance.setStatus("AVAILABLE");
        ambulance.setCurrentEmergencyId(null);
        ambulanceRepository.save(ambulance);

        // Request next nearest ambulance
        EmergencyRequest emergency = emergencyRepository.findById(request.getEmergencyId()).orElse(null);
        if (emergency != null) {
            requestNextNearestAmbulance(emergency);
        }

        return true;
    }

    private void requestNextNearestAmbulance(EmergencyRequest emergency) {
        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("AVAILABLE").stream()
                .filter(amb -> amb.getDriver() != null)
                .collect(Collectors.toList());
        if (availableAmbulances.isEmpty()) {
            emergency.setStatus("AMBULANCE_UNAVAILABLE");
            emergencyRepository.save(emergency);
            notifyAmbulanceUnavailable(emergency);
            return;
        }

        List<AmbulanceDistance> distances = new ArrayList<>();
        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(emergency.getLatitude(), emergency.getLongitude(),
                    amb.getLatitude(), amb.getLongitude());
            int eta = (int) Math.ceil((dist / 40.0) * 60.0);
            distances.add(new AmbulanceDistance(amb, dist, eta));
        }

        distances.sort(Comparator.comparingDouble(AmbulanceDistance::distance));

        for (AmbulanceDistance ad : distances) {
            AmbulanceRequest request = createRequest(emergency, ad.ambulance(), ad.distance(), ad.eta());
            if (request != null) {
                ad.ambulance().setStatus("REQUESTED");
                ad.ambulance().setCurrentEmergencyId(emergency.getId());
                ambulanceRepository.save(ad.ambulance());

                emergency.setStatus("AMBULANCE_REQUESTED");
                emergencyRepository.save(emergency);

                sendRequestToDriver(ad.ambulance().getDriver(), request, emergency, ad.distance(), ad.eta());
                break;
            }
        }
    }

    private void notifyAmbulanceAccepted(AmbulanceRequest request, Ambulance ambulance, EmergencyRequest emergency) {
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("emergencyId", emergency.getId());
        payload.put("ambulanceId", ambulance.getId());
        payload.put("ambulanceUnitId", ambulance.getUnitId());
        payload.put("driverName", ambulance.getDriver() != null ? ambulance.getDriver().getFullName() : "Unknown");
        payload.put("status", "AMBULANCE_ACCEPTED");
        payload.put("distanceKm", request.getDistanceKm());
        payload.put("etaMinutes", request.getEtaMinutes());

        Object wsPayload = payload;

        // Broadcast to patient, family, hospital, doctor
        messagingTemplate.convertAndSend("/topic/emergency/" + emergency.getId(), wsPayload);
        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulance.getId(), wsPayload);
        if (emergency.getHospitalId() != null) {
            messagingTemplate.convertAndSend("/topic/hospital/" + emergency.getHospitalId() + "/emergencies", wsPayload);
        }
        if (emergency.getDoctorId() != null && emergency.getDoctorId() > 0) {
            messagingTemplate.convertAndSend("/topic/doctor/" + emergency.getDoctorId() + "/emergencies", wsPayload);
        }
        messagingTemplate.convertAndSend("/topic/family-notifications/" + emergency.getPatientUid(), wsPayload);
    }

    private void notifyAmbulanceUnavailable(EmergencyRequest emergency) {
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("emergencyId", emergency.getId());
        payload.put("status", "AMBULANCE_UNAVAILABLE");
        payload.put("message", "No ambulances currently available");

        Object wsPayload = payload;

        messagingTemplate.convertAndSend("/topic/emergency/" + emergency.getId(), wsPayload);
        if (emergency.getHospitalId() != null) {
            messagingTemplate.convertAndSend("/topic/hospital/" + emergency.getHospitalId() + "/emergencies", wsPayload);
        }
        if (emergency.getDoctorId() != null && emergency.getDoctorId() > 0) {
            messagingTemplate.convertAndSend("/topic/doctor/" + emergency.getDoctorId() + "/emergencies", wsPayload);
        }
        messagingTemplate.convertAndSend("/topic/family-notifications/" + emergency.getPatientUid(), wsPayload);
    }

    @Transactional
    public void updateAmbulanceStatus(Long ambulanceId, String status, Double lat, Double lng) {
        Ambulance ambulance = ambulanceRepository.findById(ambulanceId).orElse(null);
        if (ambulance == null) return;

        ambulance.setStatus(status);
        if (lat != null) ambulance.setLatitude(lat);
        if (lng != null) ambulance.setLongitude(lng);
        ambulanceRepository.save(ambulance);

        // Broadcast location update
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("ambulanceId", ambulanceId);
        payload.put("unitId", ambulance.getUnitId());
        payload.put("status", status);
        payload.put("latitude", ambulance.getLatitude());
        payload.put("longitude", ambulance.getLongitude());
        payload.put("timestamp", LocalDateTime.now().toString());

        Object wsPayload = payload;

        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulanceId, wsPayload);

        if (ambulance.getCurrentEmergencyId() != null) {
            EmergencyRequest emergency = emergencyRepository.findById(ambulance.getCurrentEmergencyId()).orElse(null);
            if (emergency != null) {
                // Update emergency status based on ambulance status
                switch (status) {
                    case "EN_ROUTE_TO_PATIENT":
                        emergencyWorkflowService.onAmbulanceEnRoute(emergency);
                        break;
                    case "ARRIVED_AT_PATIENT":
                        emergencyWorkflowService.onArrivedAtPatient(emergency);
                        break;
                    case "PATIENT_PICKED_UP":
                        emergencyWorkflowService.onPatientPickedUp(emergency);
                        break;
                    case "EN_ROUTE_TO_HOSPITAL":
                        emergencyWorkflowService.onEnRouteToHospital(emergency);
                        break;
                    case "ARRIVED_AT_HOSPITAL":
                        emergencyWorkflowService.onArrivedAtHospital(emergency);
                        break;
                    case "COMPLETED":
                        if (ambulance.getCurrentEmergencyId() != null) {
                            List<AmbulanceRequest> activeReqs = requestRepository.findByEmergencyIdAndStatusIn(
                                    ambulance.getCurrentEmergencyId(), List.of("PENDING", "ACCEPTED"));
                            for (AmbulanceRequest ar : activeReqs) {
                                ar.setStatus("COMPLETED");
                                requestRepository.save(ar);
                            }
                        }
                        ambulance.setStatus("AVAILABLE");
                        ambulance.setCurrentEmergencyId(null);
                        ambulanceRepository.save(ambulance);
                        break;
                }

                messagingTemplate.convertAndSend("/topic/emergency/" + ambulance.getCurrentEmergencyId(), wsPayload);
                
                // Also broadcast to hospital, doctor, and family topics
                if (emergency.getHospitalId() != null) {
                    messagingTemplate.convertAndSend("/topic/hospital/" + emergency.getHospitalId() + "/emergencies", wsPayload);
                }
                if (emergency.getDoctorId() != null && emergency.getDoctorId() > 0) {
                    messagingTemplate.convertAndSend("/topic/doctor/" + emergency.getDoctorId() + "/emergencies", wsPayload);
                }
                messagingTemplate.convertAndSend("/topic/family-notifications/" + emergency.getPatientUid(), wsPayload);
            }
        }
    }

    public Optional<Ambulance> getCurrentJob(Long driverId) {
        Optional<Ambulance> ambOpt = ambulanceRepository.findByDriverId(driverId);
        if (ambOpt.isEmpty()) {
            User driver = userRepository.findById(driverId).orElse(null);
            if (driver != null && driver.getAmbulanceId() != null) {
                ambOpt = ambulanceRepository.findById(driver.getAmbulanceId());
            }
        }
        return ambOpt;
    }

    public List<AmbulanceRequest> getPendingRequests(Long driverId) {
        Ambulance ambulance = ambulanceRepository.findByDriverId(driverId).orElse(null);
        if (ambulance == null) {
            User driver = userRepository.findById(driverId).orElse(null);
            if (driver != null && driver.getAmbulanceId() != null) {
                ambulance = ambulanceRepository.findById(driver.getAmbulanceId()).orElse(null);
            }
        }
        if (ambulance == null) return List.of();
        return requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(), List.of("PENDING"));
    }

    private String getPatientName(String patientUid) {
        return userRepository.findByUid(patientUid)
                .map(User::getFullName)
                .orElse("Unknown Patient");
    }

    private String getHospitalName(Long hospitalId) {
        if (hospitalId == null) return "TBD";
        return hospitalRepository.findById(hospitalId)
                .map(Hospital::getName)
                .orElse("TBD");
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

    private record AmbulanceDistance(Ambulance ambulance, double distance, int eta) {}
}