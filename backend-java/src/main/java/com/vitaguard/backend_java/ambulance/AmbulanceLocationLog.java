package com.vitaguard.backend_java.ambulance;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "ambulance_location_logs")
public class AmbulanceLocationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long ambulanceId;

    private Long emergencyId;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    private Double heading;

    private Double speed;

    @Column(nullable = false)
    private LocalDateTime recordedAt;

    public AmbulanceLocationLog() {
        this.recordedAt = LocalDateTime.now();
    }

    public AmbulanceLocationLog(Long ambulanceId, Long emergencyId, Double latitude, Double longitude, Double heading, Double speed) {
        this.ambulanceId = ambulanceId;
        this.emergencyId = emergencyId;
        this.latitude = latitude;
        this.longitude = longitude;
        this.heading = heading;
        this.speed = speed;
        this.recordedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(Long ambulanceId) { this.ambulanceId = ambulanceId; }

    public Long getEmergencyId() { return emergencyId; }
    public void setEmergencyId(Long emergencyId) { this.emergencyId = emergencyId; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public Double getHeading() { return heading; }
    public void setHeading(Double heading) { this.heading = heading; }

    public Double getSpeed() { return speed; }
    public void setSpeed(Double speed) { this.speed = speed; }

    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}

