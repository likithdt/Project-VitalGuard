package com.vitaguard.backend_java.user;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/family")
public class FamilyController {

    private final UserRepository userRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;
    private final EmergencyRequestRepository emergencyRepository;

    public FamilyController(UserRepository userRepository,
                            PatientFamilyRelationshipRepository relationshipRepository,
                            EmergencyRequestRepository emergencyRepository) {
        this.userRepository = userRepository;
        this.relationshipRepository = relationshipRepository;
        this.emergencyRepository = emergencyRepository;
    }

    @PostMapping("/link")
    public ResponseEntity<?> linkFamilyMember(@RequestBody Map<String, Object> request) {
        String patientUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User patient = userRepository.findByUid(patientUid).orElse(null);

        if (patient == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Patient not found"));
        }

        if (!"PATIENT".equals(patient.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only patients can link family members"));
        }

        String familyEmail = (String) request.get("email");
        String relationship = (String) request.get("relationship");
        String contactPhone = (String) request.get("contactPhone");
        Boolean emergencyContact = (Boolean) request.getOrDefault("emergencyContact", false);

        if (familyEmail == null || familyEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Family member email is required"));
        }

        User familyUser = userRepository.findByEmail(familyEmail).orElse(null);
        if (familyUser == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Family member not found. They must register first."));
        }

        if (!"FAMILY_MEMBER".equals(familyUser.getRole())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "User must have FAMILY role"));
        }

        // Check if relationship already exists
        if (relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), familyUser.getId())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Family member already linked to this patient"));
        }

        PatientFamilyRelationship rel = new PatientFamilyRelationship(patient, familyUser, relationship, contactPhone, emergencyContact);
        relationshipRepository.save(rel);

        return ResponseEntity.ok(Map.of("message", "Family member linked successfully", "relationshipId", rel.getId()));
    }

    @GetMapping("/patients")
    public ResponseEntity<?> getLinkedPatients() {
        String familyUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User familyUser = userRepository.findByUid(familyUid).orElse(null);

        if (familyUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!"FAMILY_MEMBER".equals(familyUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only family members can access this endpoint"));
        }

        List<PatientFamilyRelationship> relationships = relationshipRepository.findByFamilyUserIdAndActiveTrue(familyUser.getId());

        List<Map<String, Object>> patients = relationships.stream()
                .filter(r -> r.getPatient() != null)
                .map(r -> {
                    User p = r.getPatient();
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", p.getId());
                    map.put("uid", p.getUid());
                    map.put("fullName", p.getFullName());
                    map.put("age", p.getAge());
                    map.put("bloodGroup", p.getBloodGroup());
                    map.put("relationship", r.getRelationship());
                    map.put("emergencyContact", r.getEmergencyContact());
                    map.put("contactPhone", r.getContactPhone());
                    return map;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(patients);
    }

    @DeleteMapping("/link/{relationshipId}")
    public ResponseEntity<?> unlinkFamilyMember(@PathVariable Long relationshipId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByUid(currentUid).orElse(null);

        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<PatientFamilyRelationship> relOpt = relationshipRepository.findById(relationshipId);
        if (relOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Relationship not found"));
        }

        PatientFamilyRelationship rel = relOpt.get();

        // Only the patient or the family member can unlink
        boolean authorized = "PATIENT".equals(currentUser.getRole()) && currentUser.getId().equals(rel.getPatient().getId())
                || "FAMILY".equals(currentUser.getRole()) && currentUser.getId().equals(rel.getFamilyUser().getId());

        if (!authorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to unlink this relationship"));
        }

        rel.setActive(false);
        relationshipRepository.save(rel);

        return ResponseEntity.ok(Map.of("message", "Family member unlinked successfully"));
    }

    @GetMapping("/emergencies/{patientUid}")
    public ResponseEntity<?> getPatientEmergencies(@PathVariable String patientUid) {
        String familyUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User familyUser = userRepository.findByUid(familyUid).orElse(null);

        if (familyUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!"FAMILY_MEMBER".equals(familyUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only family members can access this endpoint"));
        }

        // Verify family member is linked to this patient
        User patient = userRepository.findByUid(patientUid).orElse(null);
        if (patient == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Patient not found"));
        }

        boolean linked = relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), familyUser.getId());
        if (!linked) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this patient's emergencies"));
        }

        List<EmergencyRequest> emergencies = emergencyRepository.findByPatientUid(patientUid);
        return ResponseEntity.ok(emergencies);
    }

    @GetMapping("/emergency/{emergencyId}")
    public ResponseEntity<?> getEmergencyDetails(@PathVariable Long emergencyId) {
        String familyUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User familyUser = userRepository.findByUid(familyUid).orElse(null);

        if (familyUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!"FAMILY_MEMBER".equals(familyUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only family members can access this endpoint"));
        }

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Emergency not found"));
        }

        EmergencyRequest emergency = emergencyOpt.get();

        // Verify family member is linked to this patient
        User patient = userRepository.findByUid(emergency.getPatientUid()).orElse(null);
        if (patient == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Patient not found"));
        }

        boolean linked = relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), familyUser.getId());
        if (!linked) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this emergency"));
        }

        return ResponseEntity.ok(emergency);
    }
}