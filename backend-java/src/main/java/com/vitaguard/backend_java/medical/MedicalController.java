package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/patients")
public class MedicalController {

    private final MedicalProfileRepository medicalProfileRepository;
    private final UserRepository userRepository;
    private final MedicalHistoryRepository medicalHistoryRepository;

    public MedicalController(
            MedicalProfileRepository medicalProfileRepository,
            UserRepository userRepository,
            MedicalHistoryRepository medicalHistoryRepository
    ) {
        this.medicalProfileRepository = medicalProfileRepository;
        this.userRepository = userRepository;
        this.medicalHistoryRepository = medicalHistoryRepository;
    }

    @GetMapping("/me/medical-profile")
    public ResponseEntity<?> getMyMedicalProfile() {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return getMedicalProfileByUid(uid);
    }

    @PutMapping("/me/medical-profile")
    public ResponseEntity<?> updateMyMedicalProfile(@RequestBody MedicalProfile profileUpdates) {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return updateMedicalProfileByUid(uid, profileUpdates);
    }

    @GetMapping("/me/medical-history")
    public ResponseEntity<?> getMyMedicalHistory() {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(medicalHistoryRepository.findByPatientUid(uid));
    }

    @PostMapping("/me/medical-history")
    public ResponseEntity<?> addMyMedicalHistory(@RequestBody MedicalHistory entry) {
        String uid = SecurityContextHolder.getContext().getAuthentication().getName();
        entry.setPatientUid(uid);
        if (entry.getDate() == null || entry.getDate().isEmpty()) {
            entry.setDate(new java.text.SimpleDateFormat("yyyy-MM-dd").format(new java.util.Date()));
        }
        MedicalHistory saved = medicalHistoryRepository.save(entry);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{uid}/medical-history")
    public ResponseEntity<?> getPatientMedicalHistory(@PathVariable String uid) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        boolean authorized = requesterUid.equals(uid) 
                || "DOCTOR".equals(requester.getRole()) 
                || "HOSPITAL_ADMIN".equals(requester.getRole())
                || isLinkedFamilyMember(requester, uid);

        if (!authorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to view this patient's medical history");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        return ResponseEntity.ok(medicalHistoryRepository.findByPatientUid(uid));
    }

    @PostMapping("/{uid}/medical-history")
    public ResponseEntity<?> addPatientMedicalHistory(@PathVariable String uid, @RequestBody MedicalHistory entry) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        boolean authorized = "DOCTOR".equals(requester.getRole()) 
                || "HOSPITAL_ADMIN".equals(requester.getRole());

        if (!authorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to add medical history for this patient");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        entry.setPatientUid(uid);
        if (entry.getDate() == null || entry.getDate().isEmpty()) {
            entry.setDate(new java.text.SimpleDateFormat("yyyy-MM-dd").format(new java.util.Date()));
        }
        MedicalHistory saved = medicalHistoryRepository.save(entry);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{uid}/medical-profile")
    public ResponseEntity<?> getPatientMedicalProfile(@PathVariable String uid) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);
        
        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Authorization checks:
        // 1. Patient querying their own profile
        // 2. Family member querying linked patient profile
        // 3. Doctor querying patient profile
        // 4. Hospital Admin querying patient profile
        boolean authorized = requesterUid.equals(uid) 
                || "DOCTOR".equals(requester.getRole()) 
                || "HOSPITAL_ADMIN".equals(requester.getRole())
                || isLinkedFamilyMember(requester, uid);

        if (!authorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to view this patient's medical profile");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        return getMedicalProfileByUid(uid);
    }

    @PutMapping("/{uid}/medical-profile")
    public ResponseEntity<?> updatePatientMedicalProfile(@PathVariable String uid, @RequestBody MedicalProfile profileUpdates) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        boolean authorized = requesterUid.equals(uid) 
                || "DOCTOR".equals(requester.getRole()) 
                || "HOSPITAL_ADMIN".equals(requester.getRole());

        if (!authorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to update this patient's medical profile");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        return updateMedicalProfileByUid(uid, profileUpdates);
    }

    private ResponseEntity<?> getMedicalProfileByUid(String uid) {
        return medicalProfileRepository.findByUserUid(uid)
                .map(ResponseEntity::ok)
                .orElseGet(() -> {
                    // Create a blank profile if none exists
                    User user = userRepository.findByUid(uid).orElse(null);
                    if (user == null) {
                        return ResponseEntity.notFound().build();
                    }
                    MedicalProfile profile = new MedicalProfile(user);
                    medicalProfileRepository.save(profile);
                    return ResponseEntity.ok(profile);
                });
    }

    private ResponseEntity<?> updateMedicalProfileByUid(String uid, MedicalProfile updates) {
        User user = userRepository.findByUid(uid).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        MedicalProfile profile = medicalProfileRepository.findByUserUid(uid)
                .orElse(new MedicalProfile(user));

        profile.setExistingConditions(updates.getExistingConditions());
        profile.setPreviousHeartProblems(updates.getPreviousHeartProblems());
        profile.setDiabetes(updates.getDiabetes());
        profile.setHypertension(updates.getHypertension());
        profile.setAsthma(updates.getAsthma());
        profile.setPreviousSurgeries(updates.getPreviousSurgeries());
        profile.setPreviousHospitalizations(updates.getPreviousHospitalizations());
        profile.setAllergies(updates.getAllergies());
        profile.setCurrentMedications(updates.getCurrentMedications());
        profile.setChestPain(updates.getChestPain());
        profile.setShortnessOfBreath(updates.getShortnessOfBreath());
        profile.setPalpitations(updates.getPalpitations());
        profile.setDizziness(updates.getDizziness());
        profile.setFainting(updates.getFainting());
        profile.setHeadache(updates.getHeadache());
        profile.setSeizures(updates.getSeizures());
        profile.setAbdominalPain(updates.getAbdominalPain());
        profile.setCustomSymptoms(updates.getCustomSymptoms());

        medicalProfileRepository.save(profile);
        return ResponseEntity.ok(profile);
    }

    private boolean isLinkedFamilyMember(User requester, String patientUid) {
        if (!"FAMILY_MEMBER".equals(requester.getRole())) {
            return false;
        }
        User patient = userRepository.findByUid(patientUid).orElse(null);
        if (patient == null) {
            return false;
        }
        // If the patient has this requester listed in their family members (by phone)
        return patient.getFamilyMembers().stream()
                .anyMatch(member -> member.getPhone().equals(requester.getFcmToken()) || member.getName().equals(requester.getFullName()));
    }
}
