package com.example.simplebackend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The whole of what a caller may set when creating a user. Fields the caller must
 * never control, id and version among them, are absent by construction rather
 * than filtered out later.
 */
public record CreateUserRequest(

        @NotBlank
        @Size(min = 3, max = 32)
        @Pattern(regexp = "[A-Za-z0-9_]+", message = "must contain only letters, digits and underscores")
        String username,

        @NotBlank
        @Size(max = 100)
        String name,

        @NotBlank
        // 254 is the longest address an SMTP server is required to accept.
        @Size(max = 254)
        @Email
        String email) {
}
