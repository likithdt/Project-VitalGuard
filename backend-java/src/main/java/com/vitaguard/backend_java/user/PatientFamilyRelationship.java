package com.vitaguard.backend_java.user;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "patient_family_relationships")
public class PatientFamilyRelationship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    @JsonBackReference("patient-relationships")
    private User patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "family_user_id", nullable = false)
    @JsonBackReference("family-relationships")
    private User familyUser;

    private String relationship; // e.g., "Spouse", "Child", "Parent", "Sibling", "Other"

    private String contactPhone;

    private Boolean emergencyContact = false;

    private Boolean active = true;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public PatientFamilyRelationship() {}

    public PatientFamilyRelationship(User patient, User familyUser, String relationship, String contactPhone, Boolean emergencyContact) {
        this.patient = patient;
        this.familyUser = familyUser;
        this.relationship = relationship;
        this.contactPhone = contactPhone;
        this.emergencyContact = emergencyContact;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getPatient() { return patient; }
    public void setPatient(User patient) { this.patient = patient; }

    public User getFamilyUser() { return familyUser; }
    public void setFamilyUser(User familyUser) { this.familyUser = familyUser; }

    public String getRelationship() { return relationship; }
    public void setRelationship(String relationship) { this.relationship = relationship; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public Boolean getEmergencyContact() { return emergencyContact; }
    public void setEmergencyContact(Boolean emergencyContact) { this.emergencyContact = emergencyContact; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}