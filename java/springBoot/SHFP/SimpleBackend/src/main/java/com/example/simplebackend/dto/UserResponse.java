package com.example.simplebackend.dto;

import com.example.simplebackend.model.UserEntity;
import java.time.Instant;

/**
 * What a user looks like over the wire. Controllers return one of these and never
 * the entity, so adding a column does not silently add a field to the API.
 */
public record UserResponse(
        long id,
        String username,
        String name,
        String email,
        long version,
        Instant createdAt,
        Instant updatedAt) {

    public static UserResponse of(UserEntity user) {
        return new UserResponse(user.id(), user.username(), user.name(), user.email(), user.version(),
                user.createdAt(), user.updatedAt());
    }
}
