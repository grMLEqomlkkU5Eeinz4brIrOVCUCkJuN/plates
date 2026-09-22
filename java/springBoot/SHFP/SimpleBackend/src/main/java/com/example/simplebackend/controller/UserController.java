package com.example.simplebackend.controller;

import com.example.simplebackend.dto.CreateUserRequest;
import com.example.simplebackend.dto.CursorPageResponse;
import com.example.simplebackend.dto.UpdateUserRequest;
import com.example.simplebackend.dto.UserResponse;
import com.example.simplebackend.exception.ApiException;
import com.example.simplebackend.exception.ErrorCode;
import com.example.simplebackend.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

// Deliberately not @Validated: that routes parameter constraints through an AOP
// proxy which raises a bare ConstraintViolationException. Left to the framework's
// own method validation, a bad limit arrives as HandlerMethodValidationException
// and the handler can name the parameter that failed.
@RestController
@RequestMapping("/api/v1/users")
class UserController {

    private final UserService users;

    UserController(UserService users) {
        this.users = users;
    }

    @PostMapping
    ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        UserResponse created = users.create(request);
        return ResponseEntity.created(URI.create("/api/v1/users/" + created.id()))
                .eTag(etag(created))
                .body(created);
    }

    @GetMapping
    CursorPageResponse<UserResponse> list(
            @RequestParam(required = false) Long after,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        return users.list(after, limit);
    }

    @GetMapping("/{id}")
    ResponseEntity<UserResponse> get(@PathVariable long id) {
        UserResponse user = users.get(id);
        return ResponseEntity.ok().eTag(etag(user)).body(user);
    }

    @PutMapping("/{id}")
    ResponseEntity<UserResponse> update(
            @PathVariable long id,
            @Valid @RequestBody UpdateUserRequest request,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {

        UserResponse updated = users.update(id, request, expectedVersion(ifMatch));
        return ResponseEntity.ok().eTag(etag(updated)).body(updated);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(
            @PathVariable long id,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {

        users.delete(id, expectedVersion(ifMatch));
        return ResponseEntity.noContent().build();
    }

    private static String etag(UserResponse user) {
        return "\"" + user.version() + "\"";
    }

    /**
     * Returns the version the caller believes it is updating, or null for no
     * condition. "*" means "whatever version exists", which here is the same as
     * sending nothing, because both still require the user to exist.
     */
    private static Long expectedVersion(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            return null;
        }
        String value = ifMatch.strip();
        if (value.equals("*")) {
            return null;
        }
        if (value.startsWith("W/")) {
            // A weak tag says "same resource, maybe different bytes", which is not
            // strong enough to decide whether an update is safe.
            throw new ApiException(ErrorCode.PRECONDITION_FAILED, "If-Match must be a strong entity tag");
        }
        try {
            return Long.parseLong(value.replace("\"", ""));
        } catch (NumberFormatException notATag) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED,
                    "If-Match must be an entity tag this service issued, such as \"3\"");
        }
    }
}
