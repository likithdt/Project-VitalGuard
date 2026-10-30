package com.vitaguard.backend_java.emergency;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EmergencyRequestRepository extends JpaRepository<EmergencyRequest, Long> {
    List<EmergencyRequest> findByPatientUid(String patientUid);
    List<EmergencyRequest> findByStatusIn(List<String> statuses);
    List<EmergencyRequest> findByHospitalIdAndStatusIn(Long hospitalId, List<String> statuses);
    List<EmergencyRequest> findByPatientUidAndStatusIn(String patientUid, List<String> statuses);
    List<EmergencyRequest> findByHospitalId(Long hospitalId);
    long countByHospitalId(Long hospitalId);
    List<EmergencyRequest> findByDoctorId(Long doctorId);
    long countByDoctorIdAndStatusIn(Long doctorId, List<String> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT er FROM EmergencyRequest er WHERE er.id = :id")
    Optional<EmergencyRequest> findByIdForUpdate(@Param("id") Long id);
}

