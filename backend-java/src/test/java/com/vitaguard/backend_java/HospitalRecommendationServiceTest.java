package com.vitaguard.backend_java;

import com.vitaguard.backend_java.hospital.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class HospitalRecommendationServiceTest {
    @Test
    void nearestSuitableHospitalWinsOverHigherRating() {
        HospitalRepository hospitals = mock(HospitalRepository.class);
        HospitalDepartmentRepository departments = mock(HospitalDepartmentRepository.class);
        HospitalRecommendationService service = new HospitalRecommendationService(hospitals, departments);
        Hospital near = new Hospital("Near", 0.0, 0.018, 10, 3, 3, 1, 1.0);
        near.setId(1L);
        Hospital far = new Hospital("Far", 0.0, 0.063, 10, 3, 3, 1, 5.0);
        far.setId(2L);
        Hospital full = new Hospital("Full", 0.0, 0.009, 10, 0, 3, 1, 5.0);
        full.setId(3L);
        HospitalDepartment department = mock(HospitalDepartment.class);
        when(department.getAvailableBeds()).thenReturn(3);
        when(department.getAvailableDoctors()).thenReturn(1);
        when(department.getAcceptingPatients()).thenReturn(true);
        when(department.getAvailable()).thenReturn(true);
        when(hospitals.findAll()).thenReturn(List.of(far, full, near));
        when(departments.findByHospitalIdAndName(anyLong(), eq("Emergency")))
                .thenReturn(Optional.of(department));

        List<HospitalRecommendation> result = service.getRecommendations(0.0, 0.0, "Emergency");

        assertEquals(List.of(1L, 2L), result.stream().map(r -> r.getHospital().getId()).toList());
        assertEquals(2.0015, result.get(0).getDistance(), 0.001);
    }
}
