package com.example.simplebackend.service;

import com.example.simplebackend.dto.CreateUserRequest;
import com.example.simplebackend.dto.CursorPageResponse;
import com.example.simplebackend.dto.UpdateUserRequest;
import com.example.simplebackend.dto.UserResponse;
import com.example.simplebackend.exception.ApiException;
import com.example.simplebackend.exception.ErrorCode;
import com.example.simplebackend.model.UserEntity;
import com.example.simplebackend.repository.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class UserService {

    private static final int MAX_CAUSE_DEPTH = 16;

    private final UserRepository users;

    UserService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public UserResponse get(long id) {
        return UserResponse.of(require(id));
    }

    /**
     * Keyset pagination: each page asks for rows after the last id the caller saw.
     * An offset would shift under concurrent inserts and deletes, so a caller
     * paging through would see rows twice or miss them.
     */
    @Transactional(readOnly = true)
    public CursorPageResponse<UserResponse> list(Long after, int limit) {
        // One extra row answers "is there another page" without a second query.
        List<UserEntity> rows = users.findByIdGreaterThanOrderByIdAsc(
                after != null ? after : Long.MIN_VALUE, Limit.of(limit + 1));

        boolean hasMore = rows.size() > limit;
        List<UserEntity> page = hasMore ? rows.subList(0, limit) : rows;
        Long nextAfter = hasMore ? page.getLast().id() : null;
        return new CursorPageResponse<>(page.stream().map(UserResponse::of).toList(), nextAfter);
    }

    public UserResponse create(CreateUserRequest request) {
        UserEntity user = new UserEntity(
                normalize(request.username()), request.name().strip(), normalize(request.email()));
        return UserResponse.of(write(user));
    }

    /**
     * expectedVersion comes from the caller's If-Match. The check here answers a
     * stale client with 412 before any write; two callers who both pass it are
     * still separated by the version column, which turns the loser into a 409.
     */
    public UserResponse update(long id, UpdateUserRequest request, Long expectedVersion) {
        UserEntity user = require(id);
        requireVersion(user, expectedVersion);
        user.applyProfile(request.name().strip(), normalize(request.email()));
        return UserResponse.of(write(user));
    }

    /**
     * Deleting a user that is already gone succeeds. A caller retrying after a
     * timeout must not be told its first attempt failed when it did not.
     */
    public void delete(long id, Long expectedVersion) {
        users.findById(id).ifPresent(user -> {
            requireVersion(user, expectedVersion);
            users.delete(user);
        });
    }

    private static void requireVersion(UserEntity user, Long expectedVersion) {
        if (expectedVersion != null && expectedVersion != user.version()) {
            throw new ApiException(ErrorCode.PRECONDITION_FAILED,
                    "User %d has since changed; re-read it and retry".formatted(user.id()));
        }
    }

    private UserEntity require(long id) {
        return users.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "No user with id %d".formatted(id)));
    }

    private UserEntity write(UserEntity user) {
        try {
            return users.saveAndFlush(user);
        } catch (OptimisticLockingFailureException ignored) {
            throw new ApiException(ErrorCode.CONCURRENT_MODIFICATION,
                    "User %d was changed by another request; re-read it and retry".formatted(user.id()));
        } catch (DataIntegrityViolationException violation) {
            throw switch (constraintName(violation)) {
                case "uk_users_username" -> new ApiException(ErrorCode.USERNAME_TAKEN, "That username is taken");
                case "uk_users_email" -> new ApiException(ErrorCode.EMAIL_TAKEN, "That email is already registered");
                // Some other constraint broke, which is a defect here rather than
                // the caller's fault. Surfacing it as a 409 would hide it.
                case null, default -> violation;
            };
        }
    }

    /** The database's name for the constraint that rejected the write, or null. */
    private static String constraintName(DataIntegrityViolationException violation) {
        Throwable cause = violation;
        for (int depth = 0; cause != null && depth < MAX_CAUSE_DEPTH; depth++, cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException hibernate && hibernate.getConstraintName() != null) {
                return hibernate.getConstraintName().toLowerCase(Locale.ROOT);
            }
        }
        return null;
    }

    /**
     * Locale.ROOT, not the default locale: under a Turkish default, "I" lowercases
     * to a dotless i and the same address stored twice stops colliding.
     */
    private static String normalize(String value) {
        return value.strip().toLowerCase(Locale.ROOT);
    }
}
