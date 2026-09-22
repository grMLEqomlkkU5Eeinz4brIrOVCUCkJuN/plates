package com.example.simplebackend.dto;

import com.example.simplebackend.model.UserEntity;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Username is missing on purpose: see {@link UserEntity#applyProfile}. */
public record UpdateUserRequest(

        @NotBlank
        @Size(max = 100)
        String name,

        @NotBlank
        @Size(max = 254)
        @Email
        String email) {
}
