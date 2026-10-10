package com.vitaguard.backend_java.user;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class FamilyNotificationService {

    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public FamilyNotificationService(
            UserRepository userRepository,
            HospitalRepository hospitalRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.userRepository = userRepository;
        this.hospitalRepository = hospitalRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.relationshipRepository = relationshipRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public void sendFamilyNotification(EmergencyRequest emergency, String vitalsDescription, String ambulanceStatus, String eta) {
        Optional<User> userOpt = userRepository.findByUid(emergency.getPatientUid());
        if (!userOpt.isPresent()) {
            return;
        }

        User patient = userOpt.get();
        List<PatientFamilyRelationship> relationships = relationshipRepository.findByPatientIdAndActiveTrue(patient.getId());

        if (relationships == null || relationships.isEmpty()) {
            System.out.println("[FamilyNotify] No registered family contacts found for patient " + patient.getUid());
            return;
        }

        String hospitalName = "TBD";
        if (emergency.getHospitalId() != null) {
            hospitalName = hospitalRepository.findById(emergency.getHospitalId())
                    .map(Hospital::getName)
                    .orElse("TBD");
        }

        String doctorName = "TBD";
        if (emergency.getDoctorId() != null) {
            if (emergency.getDoctorId() == -1L) {
                doctorName = "Emergency Team";
            } else {
                doctorName = doctorRepository.findById(emergency.getDoctorId())
                        .map(Doctor::getName)
                        .orElse("TBD");
            }
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("patientName", patient.getFullName());
        payload.put("patientUid", patient.getUid());
        payload.put("severity", emergency.getSeverity());
        payload.put("vitals", vitalsDescription);
        payload.put("hospital", hospitalName);
        payload.put("doctor", doctorName);
        payload.put("ambulanceStatus", ambulanceStatus);
        payload.put("eta", eta);
        payload.put("timestamp", java.time.LocalDateTime.now().toString());

        // Broadcast to WebSocket channel for this patient's family members
        try {
            messagingTemplate.convertAndSend("/topic/family-notifications/" + patient.getUid(), (Object) payload);
            System.out.println("[FamilyNotify] Successfully broadcast family notification for patient " + patient.getUid());
        } catch (Exception e) {
            System.err.println("[FamilyNotify] Failed to send WebSocket notification: " + e.getMessage());
        }
    }
}
