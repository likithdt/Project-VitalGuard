package com.vitaguard.backend_java.doctor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DoctorAssessmentRepository extends JpaRepository<DoctorAssessment, Long> {

    @Query("SELECT d FROM DoctorAssessment d WHERE d.emergencyId = :emergencyId")
    Optional<DoctorAssessment> findByEmergencyId(@Param("emergencyId") Long emergencyId);

    @Query("SELECT d FROM DoctorAssessment d WHERE d.doctorId = :doctorId AND d.status IN ('PENDING', 'IN_PROGRESS')")
    List<DoctorAssessment> findPendingAssessmentsByDoctorId(@Param("doctorId") Long doctorId);

    @Query("SELECT d FROM DoctorAssessment d WHERE d.doctorId = :doctorId")
    List<DoctorAssessment> findByDoctorId(@Param("doctorId") Long doctorId);

    @Query("SELECT d FROM DoctorAssessment d WHERE d.emergencyId = :emergencyId AND d.doctorId = :doctorId")
    Optional<DoctorAssessment> findByEmergencyIdAndDoctorId(@Param("emergencyId") Long emergencyId, @Param("doctorId") Long doctorId);
}