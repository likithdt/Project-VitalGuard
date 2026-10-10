package com.vitaguard.backend_java.hospital;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.vitaguard.backend_java.doctor.Doctor;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "hospitals")
public class Hospital {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String name;

    private Double lat;
    private Double lng;
    private Integer totalBeds;
    private Integer availableBeds;
    private Integer totalDoctors;
    private Integer availableDoctors;
    private Double rating;

    @OneToMany(mappedBy = "hospital", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference
    private List<HospitalDepartment> departments = new ArrayList<>();

    @OneToMany(mappedBy = "hospital", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    private List<Doctor> doctors = new ArrayList<>();

    public Hospital() {}

    public Hospital(String name, Double lat, Double lng, Integer totalBeds, Integer availableBeds, Integer totalDoctors, Integer availableDoctors, Double rating) {
        this.name = name;
        this.lat = lat;
        this.lng = lng;
        this.totalBeds = totalBeds;
        this.availableBeds = availableBeds;
        this.totalDoctors = totalDoctors;
        this.availableDoctors = availableDoctors;
        this.rating = rating;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }

    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }

    public Integer getTotalBeds() { return totalBeds; }
    public void setTotalBeds(Integer totalBeds) { this.totalBeds = totalBeds; }

    public Integer getAvailableBeds() { return availableBeds; }
    public void setAvailableBeds(Integer availableBeds) { this.availableBeds = availableBeds; }

    public Integer getTotalDoctors() { return totalDoctors; }
    public void setTotalDoctors(Integer totalDoctors) { this.totalDoctors = totalDoctors; }

    public Integer getAvailableDoctors() { return availableDoctors; }
    public void setAvailableDoctors(Integer availableDoctors) { this.availableDoctors = availableDoctors; }

    public Double getRating() { return rating; }
    public void setRating(Double rating) { this.rating = rating; }

    public List<HospitalDepartment> getDepartments() { return departments; }
    public void setDepartments(List<HospitalDepartment> departments) { this.departments = departments; }

    public List<Doctor> getDoctors() { return doctors; }
    public void setDoctors(List<Doctor> doctors) { this.doctors = doctors; }
}
