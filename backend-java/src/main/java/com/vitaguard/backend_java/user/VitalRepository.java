package com.vitaguard.backend_java.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VitalRepository extends JpaRepository<Vital, Long> {
    List<Vital> findByPatientUidOrderByRecordedAtDesc(String patientUid);
    Optional<Vital> findFirstByPatientUidOrderByRecordedAtDesc(String patientUid);
}
