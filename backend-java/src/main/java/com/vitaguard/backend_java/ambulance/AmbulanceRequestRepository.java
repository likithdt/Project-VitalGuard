package com.vitaguard.backend_java.ambulance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AmbulanceRequestRepository extends JpaRepository<AmbulanceRequest, Long> {

    List<AmbulanceRequest> findByEmergencyId(Long emergencyId);

    List<AmbulanceRequest> findByAmbulanceIdAndStatusIn(Long ambulanceId, List<String> statuses);

    Optional<AmbulanceRequest> findByEmergencyIdAndAmbulanceId(Long emergencyId, Long ambulanceId);

    @Query("SELECT ar FROM AmbulanceRequest ar WHERE ar.emergencyId = :emergencyId AND ar.status = 'PENDING'")
    Optional<AmbulanceRequest> findPendingByEmergencyId(Long emergencyId);

    boolean existsByEmergencyIdAndStatusIn(Long emergencyId, List<String> statuses);

    List<AmbulanceRequest> findByEmergencyIdAndStatusIn(Long emergencyId, List<String> statuses);
}