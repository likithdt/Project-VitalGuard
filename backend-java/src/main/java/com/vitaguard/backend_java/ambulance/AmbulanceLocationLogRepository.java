package com.vitaguard.backend_java.ambulance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AmbulanceLocationLogRepository extends JpaRepository<AmbulanceLocationLog, Long> {
    List<AmbulanceLocationLog> findByAmbulanceIdOrderByRecordedAtDesc(Long ambulanceId);
    List<AmbulanceLocationLog> findByEmergencyIdOrderByRecordedAtAsc(Long emergencyId);
}

