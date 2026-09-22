package com.example.simplebackend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * Column lengths match the constraints on the request records and the widths in
 * V1__create_users_table.sql. Change one of the three and Hibernate's startup
 * validation stops the boot.
 *
 * <p>Nothing outside {@code service} should mutate one of these, and nothing
 * outside {@code dto} should read one: an entity that reaches a controller is an
 * API that changes whenever a column does.
 */
@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String username;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 254)
    private String email;

    @Version
    private long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEntity() {
    }

    public UserEntity(String username, String name, String email) {
        this.username = username;
        this.name = name;
        this.email = email;
    }

    // Username is fixed at creation: it is how other systems refer to this row.
    public void applyProfile(String name, String email) {
        this.name = name;
        this.email = email;
    }

    public Long id() {
        return id;
    }

    public String username() {
        return username;
    }

    public String name() {
        return name;
    }

    public String email() {
        return email;
    }

    public long version() {
        return version;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }
}
