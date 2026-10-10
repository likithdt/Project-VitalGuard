package com.vitaguard.backend_java.ambulance;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.vitaguard.backend_java.user.User;
import jakarta.persistence.*;

@Entity
@Table(name = "ambulances")
public class Ambulance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String unitId; // e.g. AMB-01

    private String hospitalName; // affinity, e.g. Apollo Hospital
    private String status = "AVAILABLE"; // AVAILABLE, REQUESTED, ACCEPTED, EN_ROUTE_TO_PATIENT, ARRIVED_AT_PATIENT, PATIENT_PICKED_UP, EN_ROUTE_TO_HOSPITAL, ARRIVED_AT_HOSPITAL, COMPLETED
    private Double latitude;
    private Double longitude;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_id")
    @JsonBackReference
    private User driver;

    private Long currentEmergencyId;

    public Ambulance() {}

    public Ambulance(String unitId, String hospitalName, Double latitude, Double longitude) {
        this.unitId = unitId;
        this.hospitalName = hospitalName;
        this.latitude = latitude;
        this.longitude = longitude;
        this.status = "AVAILABLE";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUnitId() { return unitId; }
    public void setUnitId(String unitId) { this.unitId = unitId; }

    public String getHospitalName() { return hospitalName; }
    public void setHospitalName(String hospitalName) { this.hospitalName = hospitalName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public User getDriver() { return driver; }
    public void setDriver(User driver) { this.driver = driver; }

    public Long getCurrentEmergencyId() { return currentEmergencyId; }
    public void setCurrentEmergencyId(Long currentEmergencyId) { this.currentEmergencyId = currentEmergencyId; }
}
