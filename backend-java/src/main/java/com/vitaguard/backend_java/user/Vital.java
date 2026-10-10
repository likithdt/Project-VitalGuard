package com.vitaguard.backend_java.user;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "vitals")
public class Vital {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String patientUid; // User's uid (e.g. LKT01)

    private Double heartRate;
    private Double spo2;
    private Double bpSystolic;
    private Double bpDiastolic;
    private Double glucose;
    private Double temperature;
    private Double respiratoryRate;
    private Double latitude;
    private Double longitude;

    private Boolean alertTriggered = false;
    private String alertMessage;

    private LocalDateTime recordedAt;

    public Vital() {}

    public Vital(String patientUid, Double heartRate, Double spo2, Double bpSystolic, Double bpDiastolic, Double glucose, Double temperature, Double respiratoryRate) {
        this(patientUid, heartRate, spo2, bpSystolic, bpDiastolic, glucose, temperature, respiratoryRate, null, null);
    }

    public Vital(String patientUid, Double heartRate, Double spo2, Double bpSystolic, Double bpDiastolic, Double glucose, Double temperature, Double respiratoryRate, Double latitude, Double longitude) {
        this.patientUid = patientUid;
        this.heartRate = heartRate;
        this.spo2 = spo2;
        this.bpSystolic = bpSystolic;
        this.bpDiastolic = bpDiastolic;
        this.glucose = glucose;
        this.temperature = temperature;
        this.respiratoryRate = respiratoryRate;
        this.latitude = latitude;
        this.longitude = longitude;
        this.recordedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPatientUid() { return patientUid; }
    public void setPatientUid(String patientUid) { this.patientUid = patientUid; }

    public Double getHeartRate() { return heartRate; }
    public void setHeartRate(Double heartRate) { this.heartRate = heartRate; }

    public Double getSpo2() { return spo2; }
    public void setSpo2(Double spo2) { this.spo2 = spo2; }

    public Double getBpSystolic() { return bpSystolic; }
    public void setBpSystolic(Double bpSystolic) { this.bpSystolic = bpSystolic; }

    public Double getBpDiastolic() { return bpDiastolic; }
    public void setBpDiastolic(Double bpDiastolic) { this.bpDiastolic = bpDiastolic; }

    public Double getGlucose() { return glucose; }
    public void setGlucose(Double glucose) { this.glucose = glucose; }

    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }

    public Double getRespiratoryRate() { return respiratoryRate; }
    public void setRespiratoryRate(Double respiratoryRate) { this.respiratoryRate = respiratoryRate; }

    public Boolean getAlertTriggered() { return alertTriggered; }
    public void setAlertTriggered(Boolean alertTriggered) { this.alertTriggered = alertTriggered; }

    public String getAlertMessage() { return alertMessage; }
    public void setAlertMessage(String alertMessage) { this.alertMessage = alertMessage; }

    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
}
