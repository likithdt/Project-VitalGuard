package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class AnomalyDetectionService {

    private final EmergencyRequestRepository emergencyRepository;

    @Value("${vitaguard.emergency.cooldown-minutes:10}")
    private int cooldownMinutes;

    public AnomalyDetectionService(EmergencyRequestRepository emergencyRepository) {
        this.emergencyRepository = emergencyRepository;
    }

    public boolean shouldTriggerEmergency(String patientUid) {
        List<EmergencyRequest> requests = emergencyRepository.findByPatientUid(patientUid);

        for (EmergencyRequest req : requests) {
            String status = req.getStatus();
            // Check for active emergencies
            if (!"COMPLETED".equalsIgnoreCase(status) &&
                !"RESOLVED".equalsIgnoreCase(status) &&
                !"CANCELLED".equalsIgnoreCase(status)) {
                return false; // Active emergency already exists
            }

            // Check for cooldown period
            LocalDateTime cooldownLimit = LocalDateTime.now().minusMinutes(cooldownMinutes);
            if (req.getCreatedAt() != null && req.getCreatedAt().isAfter(cooldownLimit)) {
                return false; // Last emergency created within cooldown period
            }
        }

        return true;
    }

    public int getCooldownMinutes() {
        return cooldownMinutes;
    }

    public void setCooldownMinutes(int cooldownMinutes) {
        this.cooldownMinutes = cooldownMinutes;
    }
}
