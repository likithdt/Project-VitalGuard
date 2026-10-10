package com.vitaguard.backend_java.ambulance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AmbulanceRepository extends JpaRepository<Ambulance, Long> {
    Optional<Ambulance> findByUnitId(String unitId);
    List<Ambulance> findByStatus(String status);
    List<Ambulance> findByStatusIn(List<String> statuses);
    List<Ambulance> findByHospitalName(String hospitalName);

    @Query("SELECT a FROM Ambulance a WHERE a.driver.id = :driverId")
    Optional<Ambulance> findByDriverId(@Param("driverId") Long driverId);

    Optional<Ambulance> findByCurrentEmergencyId(Long currentEmergencyId);
}
