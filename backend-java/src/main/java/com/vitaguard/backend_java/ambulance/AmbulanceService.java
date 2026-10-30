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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

        // Broadcast to general ambulance requests topic
        messagingTemplate.convertAndSend("/topic/ambulance/requests", wsPayload);
    }

    @Transactional
    public synchronized boolean acceptRequest(Long requestId, Long driverId) {
        if (requestId == null || driverId == null) {
            return false;
        }

        AmbulanceRequest request = requestRepository.findByIdForUpdate(requestId)
                .or(() -> requestRepository.findById(requestId))
                .orElse(null);
        if (request == null) {
            return false;
        }

        // Check if already accepted or declined
        if (!"PENDING".equalsIgnoreCase(request.getStatus())) {
            return false;
        }

        // Verify driver has an ambulance
        User driver = userRepository != null ? userRepository.findById(driverId).orElse(null) : null;

        Ambulance ambulance = ambulanceRepository.findByDriverId(driverId).orElse(null);
        if (ambulance == null && driver != null && driver.getAmbulanceId() != null) {
            ambulance = ambulanceRepository.findById(driver.getAmbulanceId()).orElse(null);
        }
        if (ambulance == null) {
            ambulance = ambulanceRepository.findById(request.getAmbulanceId()).orElse(null);
        }
        if (ambulance == null) {
            return false;
        }

        // Check if the ambulance belongs to another driver
        if (ambulance.getDriver() != null && !driverId.equals(ambulance.getDriver().getId())) {
            return false;
        }

        // Check if caller's ambulance is already busy with another active emergency
        if (ambulance.getCurrentEmergencyId() != null && !ambulance.getCurrentEmergencyId().equals(request.getEmergencyId())) {
            Optional<EmergencyRequest> activeEr = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            if (activeEr.isPresent() && !Boolean.TRUE.equals(activeEr.get().getCancelled())
                    && !"RESOLVED".equalsIgnoreCase(activeEr.get().getStatus())
                    && !"CANCELLED".equalsIgnoreCase(activeEr.get().getStatus())
                    && !"COMPLETED".equalsIgnoreCase(activeEr.get().getStatus())) {
                return false;
            }
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

        // If this request was initially assigned to a different ambulance, free the previous ambulance
        if (!request.getAmbulanceId().equals(ambulance.getId())) {
            ambulanceRepository.findById(request.getAmbulanceId()).ifPresent(prevAmb -> {
                if ("REQUESTED".equalsIgnoreCase(prevAmb.getStatus()) && request.getEmergencyId().equals(prevAmb.getCurrentEmergencyId())) {
                    prevAmb.setStatus("AVAILABLE");
                    prevAmb.setCurrentEmergencyId(null);
                    ambulanceRepository.save(prevAmb);
                }
            });
            request.setAmbulanceId(ambulance.getId());
        }

        // Accept the request
        request.setStatus("ACCEPTED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Cancel any other pending requests for this same emergency to prevent duplicate acceptance
        List<AmbulanceRequest> otherPendingRequests = requestRepository.findByEmergencyIdAndStatusIn(request.getEmergencyId(),
                List.of("PENDING"));
        if (otherPendingRequests != null) {
            for (AmbulanceRequest otherReq : otherPendingRequests) {
                if (!otherReq.getId().equals(requestId)) {
                    otherReq.setStatus("DECLINED");
                    otherReq.setRespondedAt(LocalDateTime.now());
                    requestRepository.save(otherReq);
                }
            }
        }

        // Update ambulance status
        ambulance.setStatus("ACCEPTED");
        ambulance.setCurrentEmergencyId(request.getEmergencyId());
        if (ambulance.getDriver() == null && driver != null) {
            ambulance.setDriver(driver);
        }
        ambulanceRepository.save(ambulance);

        // Update emergency
        EmergencyRequest emergency = emergencyRepository.findByIdForUpdate(request.getEmergencyId())
                .or(() -> emergencyRepository.findById(request.getEmergencyId()))
                .orElse(null);
        if (emergency != null) {
            emergency.setAmbulanceId(ambulance.getId());
            emergency.setAmbulanceDispatched(true);
            emergency.setStatus("AMBULANCE_ACCEPTED");
            emergencyRepository.save(emergency);
            
            // Call workflow service to handle status update
            emergencyWorkflowService.onAmbulanceAccepted(emergency, ambulance.getId());
        }

        // Notify all parties
        notifyAmbulanceAccepted(request, ambulance, emergency, driver);

        // Broadcast to general ambulance requests topic for UI updates
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("requestId", requestId);
        wsPayload.put("status", "ACCEPTED");
        wsPayload.put("ambulanceStatus", "DRIVER_ACCEPTED");
        wsPayload.put("emergencyId", request.getEmergencyId());
        wsPayload.put("ambulanceId", ambulance.getId());
        wsPayload.put("ambulanceUnitId", ambulance.getUnitId() != null ? ambulance.getUnitId() : "AMB-01");
        wsPayload.put("driverName", driver != null ? driver.getFullName() : (ambulance.getDriver() != null ? ambulance.getDriver().getFullName() : "Active Operator"));
        messagingTemplate.convertAndSend("/topic/ambulance/requests", (Object) wsPayload);

        return true;
    }

    @Transactional
    public synchronized boolean declineRequest(Long requestId, Long driverId) {
        AmbulanceRequest request = requestRepository.findByIdForUpdate(requestId)
                .or(() -> requestRepository.findById(requestId))
                .orElse(null);
        if (request == null) {
            return false;
        }

        if (!"PENDING".equalsIgnoreCase(request.getStatus())) {
            return false;
        }

        request.setStatus("DECLINED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Return ambulance to AVAILABLE if it was REQUESTED
        ambulanceRepository.findById(request.getAmbulanceId()).ifPresent(amb -> {
            if ("REQUESTED".equalsIgnoreCase(amb.getStatus()) && request.getEmergencyId().equals(amb.getCurrentEmergencyId())) {
                amb.setStatus("AVAILABLE");
                amb.setCurrentEmergencyId(null);
                ambulanceRepository.save(amb);
            }
        });

        // Request next nearest ambulance while keeping the emergency active
        EmergencyRequest emergency = emergencyRepository.findById(request.getEmergencyId()).orElse(null);
        if (emergency != null && !Boolean.TRUE.equals(emergency.getCancelled())
                && !"RESOLVED".equalsIgnoreCase(emergency.getStatus())
                && !"CANCELLED".equalsIgnoreCase(emergency.getStatus())) {
            requestNextNearestAmbulance(emergency);
        }

        messagingTemplate.convertAndSend("/topic/ambulance/requests", (Object) Map.of(
            "requestId", requestId,
            "status", "DECLINED",
            "emergencyId", request.getEmergencyId()
        ));

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
        notifyAmbulanceAccepted(request, ambulance, emergency, null);
    }

    private void notifyAmbulanceAccepted(AmbulanceRequest request, Ambulance ambulance, EmergencyRequest emergency, User driver) {
        if (emergency == null || ambulance == null) return;
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("emergencyId", emergency.getId());
        payload.put("ambulanceId", ambulance.getId());
        payload.put("ambulanceUnitId", ambulance.getUnitId());
        payload.put("driverName", driver != null ? driver.getFullName() : (ambulance.getDriver() != null ? ambulance.getDriver().getFullName() : "Active Operator"));
        payload.put("driverPhone", driver != null ? (driver.getPhone() != null ? driver.getPhone() : driver.getDoctorPhone()) : "");
        payload.put("status", "AMBULANCE_ACCEPTED");
        payload.put("ambulanceStatus", "DRIVER_ACCEPTED");
        payload.put("distanceKm", request != null ? request.getDistanceKm() : null);
        payload.put("etaMinutes", request != null ? request.getEtaMinutes() : null);
        payload.put("patientUid", emergency.getPatientUid());
        payload.put("hospitalId", emergency.getHospitalId());

        Object wsPayload = payload;

        // Broadcast to patient, family, hospital, doctor
        messagingTemplate.convertAndSend("/topic/emergency/" + emergency.getId(), wsPayload);
        messagingTemplate.convertAndSend("/topic/emergency-updates", wsPayload);
        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulance.getId(), wsPayload);
        messagingTemplate.convertAndSend("/topic/ambulance/requests", wsPayload);
        if (emergency.getHospitalId() != null) {
            messagingTemplate.convertAndSend("/topic/hospital/" + emergency.getHospitalId() + "/emergencies", wsPayload);
            messagingTemplate.convertAndSend("/topic/hospital/assignments", wsPayload);
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
                    case "JOURNEY_STARTED":
                        emergencyWorkflowService.onAmbulanceEnRoute(emergency);
                        break;
                    case "ARRIVED_AT_PATIENT":
                    case "ARRIVED_AT_PICKUP":
                        emergencyWorkflowService.onArrivedAtPatient(emergency);
                        break;
                    case "PATIENT_PICKED_UP":
                    case "PATIENT_ONBOARD":
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

        // Stale job cleanup: if ambulance has currentEmergencyId that is older than 2 hours or completed/cancelled/resolved
        if (ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> curEr = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            if (curEr.isEmpty()
                    || Boolean.TRUE.equals(curEr.get().getCancelled())
                    || "RESOLVED".equals(curEr.get().getStatus())
                    || "CANCELLED".equals(curEr.get().getStatus())
                    || "COMPLETED".equals(curEr.get().getStatus())) {
                ambulance.setCurrentEmergencyId(null);
                if (!"REQUESTED".equals(ambulance.getStatus())) {
                    ambulance.setStatus("AVAILABLE");
                }
                ambulanceRepository.save(ambulance);
            }
        }

        // 1. Direct requests targeted to this ambulance
        List<AmbulanceRequest> direct = requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(), List.of("PENDING"));

        // 2. All pending requests in the system for active emergencies
        List<AmbulanceRequest> allPending = requestRepository.findByStatusIn(List.of("PENDING"));

        List<AmbulanceRequest> resultList = new ArrayList<>(direct);
        Set<Long> seenIds = new HashSet<>();
        for (AmbulanceRequest ar : direct) {
            if (ar.getId() != null) seenIds.add(ar.getId());
        }

        // Show all active pending requests for fresh emergencies (< 2h old)
        if (allPending != null) {
            for (AmbulanceRequest ar : allPending) {
                if (ar.getId() != null && seenIds.contains(ar.getId())) continue;
                Optional<EmergencyRequest> er = emergencyRepository.findById(ar.getEmergencyId());
                if (er.isPresent() && !Boolean.TRUE.equals(er.get().getCancelled())
                        && !"RESOLVED".equals(er.get().getStatus())
                        && !"CANCELLED".equals(er.get().getStatus())
                        && !"AMBULANCE_NOT_REQUIRED".equals(er.get().getStatus())
                        && !"AMBULANCE_ACCEPTED".equals(er.get().getStatus())
                        && er.get().getAmbulanceId() == null
                        && (er.get().getCreatedAt() == null || er.get().getCreatedAt().isAfter(LocalDateTime.now().minusHours(24)))) {
                    resultList.add(ar);
                    if (ar.getId() != null) seenIds.add(ar.getId());
                }
            }
        }
        return resultList;
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