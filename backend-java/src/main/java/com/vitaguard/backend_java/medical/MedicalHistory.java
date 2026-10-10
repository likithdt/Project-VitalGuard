package com.vitaguard.backend_java.medical;

import jakarta.persistence.*;

@Entity
@Table(name = "medical_histories")
public class MedicalHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String patientUid; // User's uid (e.g. LKT01)

    private String date;

    @Column(columnDefinition = "TEXT")
    private String symptoms;

    @Column(columnDefinition = "TEXT")
    private String diagnosis;

    private String department;
    private String hospital;
    private String doctor;

    @Column(columnDefinition = "TEXT")
    private String treatment;

    @Column(columnDefinition = "TEXT")
    private String medications;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(columnDefinition = "TEXT")
    private String vitals; // json or formatted string of vitals

    public MedicalHistory() {}

    public MedicalHistory(String patientUid, String date, String symptoms, String diagnosis, String department, String hospital, String doctor, String treatment, String medications, String notes, String vitals) {
        this.patientUid = patientUid;
        this.date = date;
        this.symptoms = symptoms;
        this.diagnosis = diagnosis;
        this.department = department;
        this.hospital = hospital;
        this.doctor = doctor;
        this.treatment = treatment;
        this.medications = medications;
        this.notes = notes;
        this.vitals = vitals;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPatientUid() { return patientUid; }
    public void setPatientUid(String patientUid) { this.patientUid = patientUid; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getSymptoms() { return symptoms; }
    public void setSymptoms(String symptoms) { this.symptoms = symptoms; }

    public String getDiagnosis() { return diagnosis; }
    public void setDiagnosis(String diagnosis) { this.diagnosis = diagnosis; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getHospital() { return hospital; }
    public void setHospital(String hospital) { this.hospital = hospital; }

    public String getDoctor() { return doctor; }
    public void setDoctor(String doctor) { this.doctor = doctor; }

    public String getTreatment() { return treatment; }
    public void setTreatment(String treatment) { this.treatment = treatment; }

    public String getMedications() { return medications; }
    public void setMedications(String medications) { this.medications = medications; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getVitals() { return vitals; }
    public void setVitals(String vitals) { this.vitals = vitals; }
}
