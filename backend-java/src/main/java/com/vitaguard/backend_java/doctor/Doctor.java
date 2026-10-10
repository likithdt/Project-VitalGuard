package com.vitaguard.backend_java.doctor;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.vitaguard.backend_java.hospital.Hospital;
import jakarta.persistence.*;

@Entity
@Table(name = "doctors")
public class Doctor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonBackReference
    private Hospital hospital;

    private String name;
    private String phone;
    private String specialization;
    private String departmentName; // Emergency, Cardiology, Neurology, Pulmonology, Orthopedics, Trauma, General Medicine, Pediatrics, etc.
    private Boolean onDuty = true;
    private Boolean availableForEmergency = true;

    public Doctor() {}

    public Doctor(Hospital hospital, String name, String phone, String specialization, String departmentName, Boolean onDuty, Boolean availableForEmergency) {
        this.hospital = hospital;
        this.name = name;
        this.phone = phone;
        this.specialization = specialization;
        this.departmentName = departmentName;
        this.onDuty = onDuty;
        this.availableForEmergency = availableForEmergency;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Hospital getHospital() { return hospital; }
    public void setHospital(Hospital hospital) { this.hospital = hospital; }

    public Long getHospitalId() {
        return hospital != null ? hospital.getId() : null;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getSpecialization() { return specialization; }
    public void setSpecialization(String specialization) { this.specialization = specialization; }

    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }

    public Boolean getOnDuty() { return onDuty; }
    public void setOnDuty(Boolean onDuty) { this.onDuty = onDuty; }

    public Boolean getAvailableForEmergency() { return availableForEmergency; }
    public void setAvailableForEmergency(Boolean availableForEmergency) { this.availableForEmergency = availableForEmergency; }
}
