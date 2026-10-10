package com.vitaguard.backend_java.doctor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, Long> {

    @Query("SELECT d FROM Doctor d WHERE d.hospital.id = :hospitalId")
    List<Doctor> findByHospitalId(@Param("hospitalId") Long hospitalId);

    @Query("SELECT d FROM Doctor d WHERE d.hospital.id = :hospitalId AND d.departmentName = :departmentName")
    List<Doctor> findByHospitalIdAndDepartmentName(@Param("hospitalId") Long hospitalId, @Param("departmentName") String departmentName);

    @Query("SELECT d FROM Doctor d WHERE d.hospital.id = :hospitalId AND d.departmentName = :departmentName AND d.onDuty = :onDuty AND d.availableForEmergency = :availableForEmergency")
    List<Doctor> findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(
            @Param("hospitalId") Long hospitalId,
            @Param("departmentName") String departmentName,
            @Param("onDuty") Boolean onDuty,
            @Param("availableForEmergency") Boolean availableForEmergency
    );

    @Query("SELECT d FROM Doctor d WHERE d.hospital.id = :hospitalId AND d.onDuty = :onDuty")
    List<Doctor> findByHospitalIdAndOnDuty(@Param("hospitalId") Long hospitalId, @Param("onDuty") Boolean onDuty);
}
