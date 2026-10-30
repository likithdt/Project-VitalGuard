package com.vitaguard.backend_java.hospital;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HospitalAssignmentRepository extends JpaRepository<HospitalAssignment, Long> {
    List<HospitalAssignment> findByEmergencyId(Long emergencyId);
    List<HospitalAssignment> findByEmergencyIdOrderByRequestedAtDesc(Long emergencyId);
    List<HospitalAssignment> findByHospitalIdAndStatusIn(Long hospitalId, List<String> statuses);
    Optional<HospitalAssignment> findByEmergencyIdAndHospitalId(Long emergencyId, Long hospitalId);

    @Query("SELECT ha FROM HospitalAssignment ha WHERE ha.emergencyId = :emergencyId AND ha.status = 'PENDING'")
    Optional<HospitalAssignment> findPendingByEmergencyId(@Param("emergencyId") Long emergencyId);

    boolean existsByEmergencyIdAndStatusIn(Long emergencyId, List<String> statuses);
}

