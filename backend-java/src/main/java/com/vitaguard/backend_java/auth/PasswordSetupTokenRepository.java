package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasswordSetupTokenRepository extends JpaRepository<PasswordSetupToken, Long> {

    Optional<PasswordSetupToken> findByToken(String token);

    List<PasswordSetupToken> findByUser(User user);

    List<PasswordSetupToken> findByUserAndUsedFalse(User user);
}
