package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import com.vitaguard.backend_java.user.VitalRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/ai")
public class AIHealthAssessmentController {

    private final AIHealthAssessmentRepository aiRepository;
    private final AIHealthAssessmentService aiService;
    private final VitalRepository vitalRepository;

    public AIHealthAssessmentController(
            AIHealthAssessmentRepository aiRepository,
            AIHealthAssessmentService aiService,
            VitalRepository vitalRepository
    ) {
        this.aiRepository = aiRepository;
        this.aiService = aiService;
        this.vitalRepository = vitalRepository;
    }

    private boolean isAuthorized(String patientId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        if (currentUid.equals(patientId)) {
            return true;
        }
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_DOCTOR") || 
                               a.getAuthority().equals("ROLE_HOSPITAL_ADMIN") || 
                               a.getAuthority().equals("ROLE_ADMIN"));
    }

    @GetMapping("/patients/{patientId}/assessment")
    public ResponseEntity<?> getAssessment(@PathVariable String patientId) {
        if (!isAuthorized(patientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied: Unauthorized to view AI assessment"));
        }

        return aiRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/patients/{patientId}/forecast")
    public ResponseEntity<?> getForecast(@PathVariable String patientId) {
        if (!isAuthorized(patientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied: Unauthorized to view AI forecast"));
        }

        return aiRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientId)
                .map(a -> {
                    Map<String, Object> forecast = new HashMap<>();
                    forecast.put("deteriorationProbability", a.getDeteriorationProbability());
                    forecast.put("riskLevel", a.getSeverity());
                    forecast.put("predictionWindowMinutes", a.getPredictionWindowMinutes());
                    forecast.put("explanation", Arrays.asList(a.getExplanations().split("; ")));
                    return ResponseEntity.ok(forecast);
                })
                .orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/patients/{patientId}/anomalies")
    public ResponseEntity<?> getAnomalies(@PathVariable String patientId) {
        if (!isAuthorized(patientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied: Unauthorized to view AI anomalies"));
        }

        return aiRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientId)
                .map(a -> {
                    Map<String, Object> anomaly = new HashMap<>();
                    anomaly.put("anomalyScore", a.getAnomalyScore());
                    anomaly.put("anomalyDetected", a.getAnomalyScore() > 30); // flag if score exceeds 30
                    anomaly.put("explanation", a.getExplanations());
                    return ResponseEntity.ok(anomaly);
                })
                .orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/patients/{patientId}/baseline")
    public ResponseEntity<?> getBaseline(@PathVariable String patientId) {
        if (!isAuthorized(patientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied: Unauthorized to view baseline"));
        }

        List<Vital> history = vitalRepository.findByPatientUidOrderByRecordedAtDesc(patientId);
        Optional<Vital> currentOpt = vitalRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientId);
        
        if (!currentOpt.isPresent() || history.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Map<String, Object> stats = aiService.calculateBaselineAndAnomaly(currentOpt.get(), history);
        Map<String, Object> baseline = new HashMap<>();
        
        baseline.put("normalHeartRateMin", Math.max(40, ((Double) stats.get("meanHr")) - 1.5 * ((Double) stats.get("stdHr"))));
        baseline.put("normalHeartRateMax", Math.min(180, ((Double) stats.get("meanHr")) + 1.5 * ((Double) stats.get("stdHr"))));
        
        baseline.put("normalSpo2Min", Math.max(70, ((Double) stats.get("meanSpo2")) - 2.0 * ((Double) stats.get("stdSpo2"))));
        baseline.put("normalSpo2Max", 100.0);
        
        baseline.put("normalTemperatureMin", Math.max(34, ((Double) stats.get("meanTemp")) - 1.5 * ((Double) stats.get("stdTemp"))));
        baseline.put("normalTemperatureMax", Math.min(42, ((Double) stats.get("meanTemp")) + 1.5 * ((Double) stats.get("stdTemp"))));
        
        baseline.put("meanHeartRate", stats.get("meanHr"));
        baseline.put("meanSpo2", stats.get("meanSpo2"));
        baseline.put("meanTemperature", stats.get("meanTemp"));

        return ResponseEntity.ok(baseline);
    }
}
