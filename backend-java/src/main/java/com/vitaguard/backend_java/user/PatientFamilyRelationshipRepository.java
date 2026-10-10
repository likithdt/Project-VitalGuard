package com.vitaguard.backend_java.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PatientFamilyRelationshipRepository extends JpaRepository<PatientFamilyRelationship, Long> {

    List<PatientFamilyRelationship> findByPatientIdAndActiveTrue(Long patientId);

    List<PatientFamilyRelationship> findByFamilyUserIdAndActiveTrue(Long familyUserId);

    Optional<PatientFamilyRelationship> findByPatientIdAndFamilyUserIdAndActiveTrue(Long patientId, Long familyUserId);

    @Query("SELECT pfr FROM PatientFamilyRelationship pfr WHERE pfr.patient.id = :patientId AND pfr.familyUser.id = :familyUserId AND pfr.active = true")
    Optional<PatientFamilyRelationship> findActiveByPatientAndFamilyUser(Long patientId, Long familyUserId);

    boolean existsByPatientIdAndFamilyUserIdAndActiveTrue(Long patientId, Long familyUserId);
}