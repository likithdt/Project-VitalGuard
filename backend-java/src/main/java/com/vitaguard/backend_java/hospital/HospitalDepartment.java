package com.vitaguard.backend_java.hospital;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

@Entity
@Table(name = "hospital_departments")
public class HospitalDepartment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonBackReference
    private Hospital hospital;

    private String name; // Emergency, Cardiology, Neurology, Pulmonology, Orthopedics, Trauma, General Medicine, Pediatrics, etc.
    private Boolean available = true;
    private Boolean emergencyService = true;
    private Boolean acceptingPatients = true;
    private Integer availableBeds = 10;
    private Integer totalBeds = 50;
    private Integer availableDoctors = 2;
    private Integer totalDoctors = 5;

    public HospitalDepartment() {}

    public HospitalDepartment(Hospital hospital, String name, Boolean available, Boolean emergencyService, Boolean acceptingPatients, Integer availableBeds, Integer totalBeds, Integer availableDoctors, Integer totalDoctors) {
        this.hospital = hospital;
        this.name = name;
        this.available = available;
        this.emergencyService = emergencyService;
        this.acceptingPatients = acceptingPatients;
        this.availableBeds = availableBeds;
        this.totalBeds = totalBeds;
        this.availableDoctors = availableDoctors;
        this.totalDoctors = totalDoctors;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Hospital getHospital() { return hospital; }
    public void setHospital(Hospital hospital) { this.hospital = hospital; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Boolean getAvailable() { return available; }
    public void setAvailable(Boolean available) { this.available = available; }

    public Boolean getEmergencyService() { return emergencyService; }
    public void setEmergencyService(Boolean emergencyService) { this.emergencyService = emergencyService; }

    public Boolean getAcceptingPatients() { return acceptingPatients; }
    public void setAcceptingPatients(Boolean acceptingPatients) { this.acceptingPatients = acceptingPatients; }

    public Integer getAvailableBeds() { return availableBeds; }
    public void setAvailableBeds(Integer availableBeds) { this.availableBeds = availableBeds; }

    public Integer getTotalBeds() { return totalBeds; }
    public void setTotalBeds(Integer totalBeds) { this.totalBeds = totalBeds; }

    public Integer getAvailableDoctors() { return availableDoctors; }
    public void setAvailableDoctors(Integer availableDoctors) { this.availableDoctors = availableDoctors; }

    public Integer getTotalDoctors() { return totalDoctors; }
    public void setTotalDoctors(Integer totalDoctors) { this.totalDoctors = totalDoctors; }
}
