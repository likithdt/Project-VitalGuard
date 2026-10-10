package com.vitaguard.backend_java.hospital;

public class HospitalRecommendation {
    private Hospital hospital;
    private double distance; // in km
    private double eta; // in minutes
    private int score; // rank score from 0 to 100
    private String reason;

    public HospitalRecommendation() {}

    public HospitalRecommendation(Hospital hospital, double distance, double eta, int score, String reason) {
        this.hospital = hospital;
        this.distance = distance;
        this.eta = eta;
        this.score = score;
        this.reason = reason;
    }

    public Hospital getHospital() { return hospital; }
    public void setHospital(Hospital hospital) { this.hospital = hospital; }

    public double getDistance() { return distance; }
    public void setDistance(double distance) { this.distance = distance; }

    public double getEta() { return eta; }
    public void setEta(double eta) { this.eta = eta; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
