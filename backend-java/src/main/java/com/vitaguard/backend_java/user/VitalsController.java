package com.vitaguard.backend_java.user;

import com.vitaguard.backend_java.medical.RiskAnalysisService;
import com.vitaguard.backend_java.medical.RiskResult;
import com.vitaguard.backend_java.medical.AnomalyDetectionService;
import com.vitaguard.backend_java.medical.AIHealthAssessmentService;
import com.vitaguard.backend_java.medical.AIHealthAssessment;
import com.vitaguard.backend_java.emergency.EmergencyWorkflowService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api")
public class VitalsController {

    private final VitalRepository vitalRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final RiskAnalysisService riskAnalysisService;
    private final AnomalyDetectionService anomalyDetectionService;
    private final EmergencyWorkflowService workflowService;
    private final AIHealthAssessmentService aiHealthAssessmentService;

    public VitalsController(
            VitalRepository vitalRepository,
            SimpMessagingTemplate messagingTemplate,
            RiskAnalysisService riskAnalysisService,
            AnomalyDetectionService anomalyDetectionService,
            EmergencyWorkflowService workflowService,
            AIHealthAssessmentService aiHealthAssessmentService
    ) {
        this.vitalRepository = vitalRepository;
        this.messagingTemplate = messagingTemplate;
        this.riskAnalysisService = riskAnalysisService;
        this.anomalyDetectionService = anomalyDetectionService;
        this.workflowService = workflowService;
        this.aiHealthAssessmentService = aiHealthAssessmentService;
    }

    @PostMapping("/vitals")
    public ResponseEntity<Vital> addVitals(@RequestBody Map<String, Object> body) {
        String patientUid = SecurityContextHolder.getContext().getAuthentication().getName();

        Double lat = null;
        if (body.containsKey("latitude")) lat = Double.valueOf(body.get("latitude").toString());
        else if (body.containsKey("lat")) lat = Double.valueOf(body.get("lat").toString());

        Double lng = null;
        if (body.containsKey("longitude")) lng = Double.valueOf(body.get("longitude").toString());
        else if (body.containsKey("lng")) lng = Double.valueOf(body.get("lng").toString());

        Vital vital = new Vital(
                patientUid,
                Double.valueOf(body.getOrDefault("heart_rate", 75.0).toString()),
                Double.valueOf(body.getOrDefault("spO2", 98.0).toString()),
                Double.valueOf(body.getOrDefault("bp_systolic", 120.0).toString()),
                Double.valueOf(body.getOrDefault("bp_diastolic", 80.0).toString()),
                Double.valueOf(body.getOrDefault("glucose", 100.0).toString()),
                Double.valueOf(body.getOrDefault("temperature", 36.6).toString()),
                Double.valueOf(body.getOrDefault("respiratory_rate", 16.0).toString()),
                lat,
                lng
        );

        // Fetch history for trend calculation
        List<Vital> history = vitalRepository.findByPatientUidOrderByRecordedAtDesc(patientUid);

        // Perform AI Risk Analysis
        RiskResult risk = riskAnalysisService.analyzeRisk(vital, history);
        vital.setAlertTriggered("CRITICAL".equalsIgnoreCase(risk.getSeverity()) || "HIGH".equalsIgnoreCase(risk.getSeverity()));
        vital.setAlertMessage(risk.getExplanation());

        vitalRepository.save(vital);

        // Perform AI Health Assessment & Forecast
        AIHealthAssessment aiAssessment = aiHealthAssessmentService.performAssessment(vital, history, risk);

        // Broadcast vital and AI risk updates to client
        messagingTemplate.convertAndSend("/topic/vitals/" + patientUid, vital);
        messagingTemplate.convertAndSend("/topic/ai-risk/" + patientUid, aiAssessment);

        // Auto-Trigger Emergency Workflow if Severity is CRITICAL
        if ("CRITICAL".equalsIgnoreCase(risk.getSeverity())) {
            if (anomalyDetectionService.shouldTriggerEmergency(patientUid)) {
                workflowService.initiateAutomaticEmergency(
                        patientUid,
                        vital.getHeartRate(),
                        vital.getSpo2(),
                        vital.getTemperature(),
                        vital.getLatitude(),
                        vital.getLongitude(),
                        risk
                );
            }
        }

        return ResponseEntity.ok(vital);
    }

    @GetMapping("/vitals/latest")
    public ResponseEntity<?> getLatestVitals() {
        String patientUid = SecurityContextHolder.getContext().getAuthentication().getName();
        return vitalRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientUid)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/vitals/history")
    public ResponseEntity<List<Vital>> getVitalsHistory() {
        String patientUid = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(vitalRepository.findByPatientUidOrderByRecordedAtDesc(patientUid));
    }

    @GetMapping("/vitals/{patientId}")
    public ResponseEntity<?> getLatestVitalsForPatient(@PathVariable String patientId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        boolean isAuthorized = currentUid.equals(patientId) ||
                SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                        .anyMatch(a -> a.getAuthority().equals("ROLE_DOCTOR") || a.getAuthority().equals("ROLE_HOSPITAL_ADMIN") || a.getAuthority().equals("ROLE_ADMIN"));

        if (!isAuthorized) {
            return ResponseEntity.status(403).body(Map.of("error", "Unauthorized access to patient vitals"));
        }

        return vitalRepository.findFirstByPatientUidOrderByRecordedAtDesc(patientId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/vitals/{patientId}/history")
    public ResponseEntity<?> getVitalsHistoryForPatient(@PathVariable String patientId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        boolean isAuthorized = currentUid.equals(patientId) ||
                SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                        .anyMatch(a -> a.getAuthority().equals("ROLE_DOCTOR") || a.getAuthority().equals("ROLE_HOSPITAL_ADMIN") || a.getAuthority().equals("ROLE_ADMIN"));

        if (!isAuthorized) {
            return ResponseEntity.status(403).body(Map.of("error", "Unauthorized access to patient vitals history"));
        }

        return ResponseEntity.ok(vitalRepository.findByPatientUidOrderByRecordedAtDesc(patientId));
    }

    @GetMapping("/analysis/predict/{userId}")
    public ResponseEntity<?> getPrediction(@PathVariable String userId, @RequestParam(defaultValue = "24") int limit) {
        List<Vital> readings = vitalRepository.findByPatientUidOrderByRecordedAtDesc(userId);
        if (readings.isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "No vitals data found");
            return ResponseEntity.status(404).body(err);
        }

        // Limit the readings
        List<Vital> sublist = readings.subList(0, Math.min(readings.size(), limit));
        Collections.reverse(sublist); // old to new

        Map<String, Object> prediction = analyzeTrends(sublist);
        return ResponseEntity.ok(prediction);
    }

    private Map<String, Object> analyzeTrends(List<Vital> readings) {
        if (readings.size() < 3) {
            Map<String, Object> res = new HashMap<>();
            res.put("prediction", "insufficient_data");
            res.put("warning", false);
            return res;
        }

        int n = readings.size();
        double[] hrs = new double[n];
        double[] spo2s = new double[n];
        double[] bps = new double[n];
        double[] glus = new double[n];
        double[] temps = new double[n];

        for (int i = 0; i < n; i++) {
            Vital r = readings.get(i);
            hrs[i] = r.getHeartRate() != null ? r.getHeartRate() : 75.0;
            spo2s[i] = r.getSpo2() != null ? r.getSpo2() : 98.0;
            bps[i] = r.getBpSystolic() != null ? r.getBpSystolic() : 120.0;
            glus[i] = r.getGlucose() != null ? r.getGlucose() : 100.0;
            temps[i] = r.getTemperature() != null ? r.getTemperature() : 36.6;
        }

        double hrSlope = calculateSlope(hrs);
        double spo2Slope = calculateSlope(spo2s);
        double bpSlope = calculateSlope(bps);
        double tempSlope = calculateSlope(temps);

        double hrPred = predictFuture(hrs, 3);
        double spo2Pred = predictFuture(spo2s, 3);
        double tempPred = predictFuture(temps, 3);

        List<String> warnings = new ArrayList<>();
        double risk = 0.0;

        if (hrSlope > 0.5) {
            warnings.add(String.format(Locale.US, "HR rising +%.1f bpm/reading", hrSlope));
            risk += hrSlope * 2;
        }
        if (hrPred > 100) {
            warnings.add(String.format(Locale.US, "Predicted HR->%.0f bpm", hrPred));
            risk += 10;
        }
        if (spo2Slope < -0.1) {
            warnings.add(String.format(Locale.US, "SpO2 dropping -%.2f%%/reading", Math.abs(spo2Slope)));
            risk += Math.abs(spo2Slope) * 20;
        }
        if (spo2Pred < 94) {
            warnings.add(String.format(Locale.US, "Predicted SpO2->%.1f%%", spo2Pred));
            risk += 15;
        }
        if (hrSlope > 0.3 && spo2Slope < -0.08) {
            warnings.add("CRITICAL PATTERN: HR^ + SpO2v - respiratory distress risk");
            risk += 30;
        }
        if (bpSlope > 1.0) {
            warnings.add(String.format(Locale.US, "BP rising +%.1f mmHg/reading", bpSlope));
            risk += bpSlope * 1.5;
        }
        if (tempSlope > 0.05) {
            warnings.add(String.format(Locale.US, "Temperature rising +%.3f C/reading", tempSlope));
            risk += tempSlope * 20;
        }
        if (tempPred > 37.5) {
            warnings.add(String.format(Locale.US, "Predicted temp->%.1f C (fever)", tempPred));
            risk += 12;
        }

        String level = "normal";
        if (risk >= 40) level = "critical";
        else if (risk >= 20) level = "warning";
        else if (risk >= 8) level = "caution";

        Map<String, Object> result = new HashMap<>();
        result.put("prediction", level);
        result.put("warning", risk >= 20);
        result.put("risk_score", Math.round(risk * 10.0) / 10.0);
        result.put("warnings", warnings);
        result.put("analyzed_at", LocalDateTime.now().toString());
        result.put("readings_used", n);
        return result;
    }

    private double calculateSlope(double[] arr) {
        int n = arr.length;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++) {
            sumX += i;
            sumY += arr[i];
            sumXY += i * arr[i];
            sumX2 += i * i;
        }
        double denominator = n * sumX2 - sumX * sumX;
        if (denominator == 0) return 0.0;
        return (n * sumXY - sumX * sumY) / denominator;
    }

    private double predictFuture(double[] arr, int s) {
        int n = arr.length;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++) {
            sumX += i;
            sumY += arr[i];
            sumXY += i * arr[i];
            sumX2 += i * i;
        }
        double denominator = n * sumX2 - sumX * sumX;
        if (denominator == 0) return arr[n - 1];
        double slope = (n * sumXY - sumX * sumY) / denominator;
        double intercept = (sumY - slope * sumX) / n;
        return slope * (n - 1 + s) + intercept;
    }
}
