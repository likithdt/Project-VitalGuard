package com.vitaguard.backend_java.auth;

public class AuthResponse {
    private String token;
    private String uid;
    private String email;
    private String role;
    private String fullName;
    private Long hospitalId;
    private Long ambulanceId;
    private Long id;
    private Long doctorId;

    public AuthResponse(String token, String uid, String email, String role, String fullName) {
        this.token = token;
        this.uid = uid;
        this.email = email;
        this.role = role;
        this.fullName = fullName;
    }

    public AuthResponse(String token, String uid, String email, String role, String fullName, Long hospitalId, Long ambulanceId) {
        this(token, uid, email, role, fullName, hospitalId, ambulanceId, null, null);
    }

    public AuthResponse(String token, String uid, String email, String role, String fullName, Long hospitalId, Long ambulanceId, Long id, Long doctorId) {
        this.token = token;
        this.uid = uid;
        this.email = email;
        this.role = role;
        this.fullName = fullName;
        this.hospitalId = hospitalId;
        this.ambulanceId = ambulanceId;
        this.id = id;
        this.doctorId = doctorId;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public Long getHospitalId() { return hospitalId; }
    public void setHospitalId(Long hospitalId) { this.hospitalId = hospitalId; }

    public Long getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(Long ambulanceId) { this.ambulanceId = ambulanceId; }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getDoctorId() { return doctorId; }
    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }
}
