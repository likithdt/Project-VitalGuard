package com.vitaguard.backend_java.medical;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.vitaguard.backend_java.user.User;
import jakarta.persistence.*;

@Entity
@Table(name = "medical_profiles")
public class MedicalProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonBackReference
    private User user;

    @Column(columnDefinition = "TEXT")
    private String existingConditions = "No known medical conditions";

    @Column(columnDefinition = "TEXT")
    private String previousHeartProblems = "No previous heart history";

    private Boolean diabetes = false;
    private Boolean hypertension = false;
    private Boolean asthma = false;

    @Column(columnDefinition = "TEXT")
    private String previousSurgeries = "";

    @Column(columnDefinition = "TEXT")
    private String previousHospitalizations = "";

    @Column(columnDefinition = "TEXT")
    private String allergies = "No known allergies";

    @Column(columnDefinition = "TEXT")
    private String currentMedications = "No current medications";

    // Previous Symptoms Checklist
    private Boolean chestPain = false;
    private Boolean shortnessOfBreath = false;
    private Boolean palpitations = false;
    private Boolean dizziness = false;
    private Boolean fainting = false;
    private Boolean headache = false;
    private Boolean seizures = false;
    private Boolean abdominalPain = false;

    @Column(columnDefinition = "TEXT")
    private String customSymptoms = ""; // comma-separated values

    public MedicalProfile() {}

    public MedicalProfile(User user) {
        this.user = user;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getExistingConditions() { return existingConditions; }
    public void setExistingConditions(String existingConditions) { this.existingConditions = existingConditions; }

    public String getPreviousHeartProblems() { return previousHeartProblems; }
    public void setPreviousHeartProblems(String previousHeartProblems) { this.previousHeartProblems = previousHeartProblems; }

    public Boolean getDiabetes() { return diabetes; }
    public void setDiabetes(Boolean diabetes) { this.diabetes = diabetes; }

    public Boolean getHypertension() { return hypertension; }
    public void setHypertension(Boolean hypertension) { this.hypertension = hypertension; }

    public Boolean getAsthma() { return asthma; }
    public void setAsthma(Boolean asthma) { this.asthma = asthma; }

    public String getPreviousSurgeries() { return previousSurgeries; }
    public void setPreviousSurgeries(String previousSurgeries) { this.previousSurgeries = previousSurgeries; }

    public String getPreviousHospitalizations() { return previousHospitalizations; }
    public void setPreviousHospitalizations(String previousHospitalizations) { this.previousHospitalizations = previousHospitalizations; }

    public String getAllergies() { return allergies; }
    public void setAllergies(String allergies) { this.allergies = allergies; }

    public String getCurrentMedications() { return currentMedications; }
    public void setCurrentMedications(String currentMedications) { this.currentMedications = currentMedications; }

    public Boolean getChestPain() { return chestPain; }
    public void setChestPain(Boolean chestPain) { this.chestPain = chestPain; }

    public Boolean getShortnessOfBreath() { return shortnessOfBreath; }
    public void setShortnessOfBreath(Boolean shortnessOfBreath) { this.shortnessOfBreath = shortnessOfBreath; }

    public Boolean getPalpitations() { return palpitations; }
    public void setPalpitations(Boolean palpitations) { this.palpitations = palpitations; }

    public Boolean getDizziness() { return dizziness; }
    public void setDizziness(Boolean dizziness) { this.dizziness = dizziness; }

    public Boolean getFainting() { return fainting; }
    public void setFainting(Boolean fainting) { this.fainting = fainting; }

    public Boolean getHeadache() { return headache; }
    public void setHeadache(Boolean headache) { this.headache = headache; }

    public Boolean getSeizures() { return seizures; }
    public void setSeizures(Boolean seizures) { this.seizures = seizures; }

    public Boolean getAbdominalPain() { return abdominalPain; }
    public void setAbdominalPain(Boolean abdominalPain) { this.abdominalPain = abdominalPain; }

    public String getCustomSymptoms() { return customSymptoms; }
    public void setCustomSymptoms(String customSymptoms) { this.customSymptoms = customSymptoms; }
}
