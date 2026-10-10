package com.vitaguard.backend_java.medical;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AIHealthAssessmentRepository extends JpaRepository<AIHealthAssessment, Long> {
    List<AIHealthAssessment> findByPatientUidOrderByRecordedAtDesc(String patientUid);
    Optional<AIHealthAssessment> findFirstByPatientUidOrderByRecordedAtDesc(String patientUid);
}
