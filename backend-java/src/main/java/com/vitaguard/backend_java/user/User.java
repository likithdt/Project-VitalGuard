package com.vitaguard.backend_java.user;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Entity
@Table(name = "users")
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String uid; // e.g. LKT01 or Firebase UID

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password; // hashed password

    @Column(nullable = false)
    private String role; // PATIENT, FAMILY_MEMBER, DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER, SYSTEM_ADMIN

    private String fullName;
    private Integer age;
    private String bloodGroup;
    private Double latitude;
    private Double longitude;
    private String address;
    private String fcmToken;

    // Doctor/Patient association fields
    private String doctorName;
    private String doctorPhone;
    private String doctorHospital;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<FamilyMember> familyMembers = new java.util.ArrayList<>();

    @OneToMany(mappedBy = "patient", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonManagedReference("patient-relationships")
    private List<PatientFamilyRelationship> patientRelationships = new java.util.ArrayList<>();

    @OneToMany(mappedBy = "familyUser", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonManagedReference("family-relationships")
    private List<PatientFamilyRelationship> familyRelationships = new java.util.ArrayList<>();

    // For HOSPITAL_ADMIN and DOCTOR - link to their hospital
    private Long hospitalId;

    // For AMBULANCE_DRIVER - link to their ambulance
    private Long ambulanceId;

    // Account Status: ACTIVE, PENDING, REJECTED, SUSPENDED, DEACTIVATED
    @Column(nullable = false)
    private String status = "ACTIVE";

    private String phone;
    private Long doctorId;

    public User() {}

    public User(String uid, String email, String password, String role) {
        this.uid = uid;
        this.email = email;
        this.password = password;
        this.role = role;
        this.status = "ACTIVE";
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }

    public String getBloodGroup() { return bloodGroup; }
    public void setBloodGroup(String bloodGroup) { this.bloodGroup = bloodGroup; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getFcmToken() { return fcmToken; }
    public void setFcmToken(String fcmToken) { this.fcmToken = fcmToken; }

    public String getDoctorName() { return doctorName; }
    public void setDoctorName(String doctorName) { this.doctorName = doctorName; }

    public String getDoctorPhone() { return doctorPhone; }
    public void setDoctorPhone(String doctorPhone) { this.doctorPhone = doctorPhone; }

    public String getDoctorHospital() { return doctorHospital; }
    public void setDoctorHospital(String doctorHospital) { this.doctorHospital = doctorHospital; }

    public List<FamilyMember> getFamilyMembers() { return familyMembers; }
    public void setFamilyMembers(List<FamilyMember> familyMembers) { this.familyMembers = familyMembers; }

    public List<PatientFamilyRelationship> getPatientRelationships() { return patientRelationships; }
    public void setPatientRelationships(List<PatientFamilyRelationship> patientRelationships) { this.patientRelationships = patientRelationships; }

    public List<PatientFamilyRelationship> getFamilyRelationships() { return familyRelationships; }
    public void setFamilyRelationships(List<PatientFamilyRelationship> familyRelationships) { this.familyRelationships = familyRelationships; }

    public Long getHospitalId() { return hospitalId; }
    public void setHospitalId(Long hospitalId) { this.hospitalId = hospitalId; }

    public Long getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(Long ambulanceId) { this.ambulanceId = ambulanceId; }

    public String getStatus() { return status != null ? status : "ACTIVE"; }
    public void setStatus(String status) { this.status = status; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public Long getDoctorId() { return doctorId; }
    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }

    // UserDetails implementations
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    @Override
    public String getUsername() {
        return uid; // We authenticate using UID (e.g. LKT01) as principal
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { 
        return !"SUSPENDED".equalsIgnoreCase(this.status); 
    }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { 
        return "ACTIVE".equalsIgnoreCase(this.status); 
    }
}
