package com.example.simplebackend.repository;

import com.example.simplebackend.model.UserEntity;
import org.springframework.data.domain.Limit;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Extends Repository rather than JpaRepository so the methods below are the only
 * ones that exist. There is deliberately no findAll(): an unbounded read of this
 * table must not be one autocomplete away.
 */
public interface UserRepository extends Repository<UserEntity, Long> {

    Optional<UserEntity> findById(Long id);

    List<UserEntity> findByIdGreaterThanOrderByIdAsc(long after, Limit limit);

    /**
     * Flushes inside the caller's transaction so a unique violation or a stale
     * version surfaces here, where the service still knows which operation caused
     * it, rather than at commit time under the advice's catch-all.
     */
    UserEntity saveAndFlush(UserEntity user);

    void delete(UserEntity user);
}
