package com.vitaguard.backend_java.hospital;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HospitalDepartmentRepository extends JpaRepository<HospitalDepartment, Long> {

    @Query("SELECT d FROM HospitalDepartment d WHERE d.hospital.id = :hospitalId")
    List<HospitalDepartment> findByHospitalId(@Param("hospitalId") Long hospitalId);

    @Query("SELECT d FROM HospitalDepartment d WHERE d.hospital.id = :hospitalId AND d.name = :name")
    Optional<HospitalDepartment> findByHospitalIdAndName(@Param("hospitalId") Long hospitalId, @Param("name") String name);
}
