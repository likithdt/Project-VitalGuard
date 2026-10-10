package com.vitaguard.backend_java.hospital;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class HospitalRecommendationService {

    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;

    public HospitalRecommendationService(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository
    ) {
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
    }

    public List<HospitalRecommendation> getRecommendations(Double lat, Double lng, String departmentName) {
        if (!validCoordinates(lat, lng)) return List.of();
        List<Hospital> hospitals = hospitalRepository.findAll();
        List<HospitalRecommendation> recommendations = new ArrayList<>();

        for (Hospital h : hospitals) {
            if (!validCoordinates(h.getLat(), h.getLng())
                    || h.getAvailableBeds() == null || h.getAvailableBeds() <= 0
                    || h.getAvailableDoctors() == null || h.getAvailableDoctors() <= 0) continue;
            double distance = calculateDistance(lat, lng, h.getLat(), h.getLng());
            double eta = (distance / 50.0) * 60.0 + 3.0; // 50 km/h average speed + 3 mins dispatch buffer

            // Match required department
            Optional<HospitalDepartment> depOpt = departmentRepository.findByHospitalIdAndName(h.getId(), departmentName);
            HospitalDepartment dep = depOpt.orElse(null);

            // Fallback department checks
            if (dep == null) {
                dep = departmentRepository.findByHospitalIdAndName(h.getId(), "Emergency").orElse(null);
            }

            int score = 0;
            StringBuilder reasonBuilder = new StringBuilder();

            // 1. Distance score (weight: 40 points)
            double distanceScore = Math.max(0, 100 - (distance * 4.0)); // 100 score if distance is 0, drops to 0 at 25km
            int distancePart = (int) (distanceScore * 0.4);
            score += distancePart;
            reasonBuilder.append(String.format("Located %.2f km away (ETA: %.1f mins). ", distance, eta));

            if (dep != null) {
                // 2. Beds score (weight: 20 points)
                int beds = dep.getAvailableBeds() != null ? dep.getAvailableBeds() : 0;
                if (beds > 5) {
                    score += 20;
                    reasonBuilder.append("Ample bed capacity available. ");
                } else if (beds > 0) {
                    score += 10;
                    reasonBuilder.append("Limited bed capacity available. ");
                } else {
                    reasonBuilder.append("No available beds in specialized department. ");
                }

                // 3. Doctors score (weight: 20 points)
                int docs = dep.getAvailableDoctors() != null ? dep.getAvailableDoctors() : 0;
                if (docs > 1) {
                    score += 20;
                    reasonBuilder.append("Multiple on-duty doctors available. ");
                } else if (docs == 1) {
                    score += 10;
                    reasonBuilder.append("Single on-duty doctor available. ");
                } else {
                    reasonBuilder.append("No available doctors on-duty. ");
                }

                // Department specific adjustments
                if (!dep.getAcceptingPatients() || !dep.getAvailable()) {
                    score -= 50; // Heavily penalize
                    reasonBuilder.append("WARNING: Department is currently not accepting new patients. ");
                }
            } else {
                score -= 30;
                reasonBuilder.append("No matching specialized department found, falling back to emergency. ");
            }

            // 4. Hospital rating score (weight: 20 points)
            double rating = h.getRating() != null ? h.getRating() : 3.0;
            int ratingPart = (int) (rating * 4.0); // max 20 points for 5.0 rating
            score += ratingPart;

            int finalScore = Math.max(0, Math.min(100, score));

            recommendations.add(new HospitalRecommendation(h, distance, eta, finalScore, reasonBuilder.toString().trim()));
        }

        return recommendations.stream()
                .sorted(java.util.Comparator.comparingDouble(HospitalRecommendation::getDistance)
                        .thenComparing(java.util.Comparator.comparingInt(HospitalRecommendation::getScore).reversed()))
                .collect(Collectors.toList());
    }

    public static boolean validCoordinates(Double lat, Double lng) {
        return lat != null && lng != null && Double.isFinite(lat) && Double.isFinite(lng)
                && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }
}
