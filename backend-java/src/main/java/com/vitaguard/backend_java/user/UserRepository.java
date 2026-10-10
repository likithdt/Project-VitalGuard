package com.vitaguard.backend_java.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.uid = :uid")
    Optional<User> findByUidForUpdate(@org.springframework.data.repository.query.Param("uid") String uid);

    Optional<User> findByUid(String uid);
    Optional<User> findByEmail(String email);
    boolean existsByUid(String uid);
    boolean existsByEmail(String email);

    java.util.List<User> findByRole(String role);
    java.util.List<User> findByRoleIn(java.util.List<String> roles);
    java.util.List<User> findByStatus(String status);
    java.util.List<User> findByHospitalId(Long hospitalId);
    java.util.List<User> findByAmbulanceId(Long ambulanceId);
    Optional<User> findByDoctorId(Long doctorId);
    long countByRole(String role);
    long countByRoleAndStatus(String role, String status);
    long countByStatus(String status);
}
