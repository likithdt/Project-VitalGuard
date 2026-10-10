package com.vitaguard.backend_java.config;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.PatientFamilyRelationship;
import com.vitaguard.backend_java.user.PatientFamilyRelationshipRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository hospitalDepartmentRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final PatientFamilyRelationshipRepository relationshipRepository;
    private final PasswordEncoder passwordEncoder;

    public DatabaseSeeder(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository hospitalDepartmentRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            PatientFamilyRelationshipRepository relationshipRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.hospitalRepository = hospitalRepository;
        this.hospitalDepartmentRepository = hospitalDepartmentRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.relationshipRepository = relationshipRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {
        // Seed default patient user for testing
        User patient = null;
        if (!userRepository.existsByEmail("patient@vitaguard.com")) {
            patient = new User("LKT77", "patient@vitaguard.com", passwordEncoder.encode("password"), "PATIENT");
            patient.setStatus("ACTIVE");
            patient.setFullName("Likith D T");
            patient.setAge(45);
            patient.setBloodGroup("O+");
            patient.setAddress("Bangalore City Center");
            patient.setLatitude(12.9716);
            patient.setLongitude(77.5946);
            userRepository.save(patient);
            System.out.println("[SEED] Test patient LKT01 seeded successfully.");
        } else {
            patient = userRepository.findByEmail("patient@vitaguard.com").orElse(null);
            if (patient != null && !"ACTIVE".equals(patient.getStatus())) {
                patient.setStatus("ACTIVE");
                userRepository.save(patient);
            }
        }

        // Seed family member
        User familyMember = null;
        if (!userRepository.existsByEmail("family@vitaguard.com")) {
            familyMember = new User("FAM01", "family@vitaguard.com", passwordEncoder.encode("password"), "FAMILY_MEMBER");
            familyMember.setStatus("ACTIVE");
            familyMember.setFullName("Bhargav Bhat");
            familyMember.setAge(40);
            familyMember.setAddress("Bangalore City Center");
            userRepository.save(familyMember);
            System.out.println("[SEED] Test family member seeded successfully.");
        } else {
            familyMember = userRepository.findByEmail("family@vitaguard.com").orElse(null);
            if (familyMember != null && !"ACTIVE".equals(familyMember.getStatus())) {
                familyMember.setStatus("ACTIVE");
                userRepository.save(familyMember);
            }
        }

        // Seed doctor user
        User doctorUser = null;
        if (!userRepository.existsByEmail("doctor@vitaguard.com")) {
            doctorUser = new User("DOC_01", "doctor@vitaguard.com", passwordEncoder.encode("password"), "DOCTOR");
            doctorUser.setStatus("ACTIVE");
            doctorUser.setFullName("Dr. R G Sakthivelan");
            doctorUser.setAge(40);
            doctorUser.setPhone("9880123456");
            userRepository.save(doctorUser);
            System.out.println("[SEED] Test doctor user seeded successfully.");
        } else {
            doctorUser = userRepository.findByEmail("doctor@vitaguard.com").orElse(null);
            if (doctorUser != null && !"ACTIVE".equals(doctorUser.getStatus())) {
                doctorUser.setStatus("ACTIVE");
                userRepository.save(doctorUser);
            }
        }

        // Seed hospital admin user - DEMO ACCOUNT
        User hospitalAdmin = null;
        if (!userRepository.existsByEmail("hospital-admin@vitalguard.com")) {
            hospitalAdmin = new User("HSP_01", "hospital-admin@vitalguard.com", passwordEncoder.encode("password"), "HOSPITAL_ADMIN");
            hospitalAdmin.setStatus("ACTIVE");
            hospitalAdmin.setFullName("Hospital Admin (Apollo)");
            hospitalAdmin.setPhone("9880112233");
            userRepository.save(hospitalAdmin);
            System.out.println("[SEED] Demo hospital admin seeded successfully.");
        } else {
            hospitalAdmin = userRepository.findByEmail("hospital-admin@vitalguard.com").orElse(null);
            if (hospitalAdmin != null && !"ACTIVE".equals(hospitalAdmin.getStatus())) {
                hospitalAdmin.setStatus("ACTIVE");
                userRepository.save(hospitalAdmin);
            }
        }

        // Seed ambulance driver user - DEMO ACCOUNT
        User driverUser = null;
        if (!userRepository.existsByEmail("ambulance-driver@vitalguard.com")) {
            driverUser = new User("AMB_01", "ambulance-driver@vitalguard.com", passwordEncoder.encode("password"), "AMBULANCE_DRIVER");
            driverUser.setStatus("ACTIVE");
            driverUser.setFullName("Ambulance Driver (AMB-01)");
            driverUser.setPhone("9880998877");
            userRepository.save(driverUser);
            System.out.println("[SEED] Demo ambulance driver seeded successfully.");
        } else {
            driverUser = userRepository.findByEmail("ambulance-driver@vitalguard.com").orElse(null);
            if (driverUser != null && !"ACTIVE".equals(driverUser.getStatus())) {
                driverUser.setStatus("ACTIVE");
                userRepository.save(driverUser);
            }
        }

        // Seed second ambulance driver user - DEMO ACCOUNT
        User driverUser2 = null;
        if (!userRepository.existsByEmail("driver2@vitalguard.com")) {
            driverUser2 = new User("AMB_02", "driver2@vitalguard.com", passwordEncoder.encode("password"), "AMBULANCE_DRIVER");
            driverUser2.setStatus("ACTIVE");
            driverUser2.setFullName("Ambulance Driver 2 (AMB-02)");
            driverUser2.setPhone("9880998866");
            userRepository.save(driverUser2);
            System.out.println("[SEED] Demo second ambulance driver seeded successfully.");
        } else {
            driverUser2 = userRepository.findByEmail("driver2@vitalguard.com").orElse(null);
            if (driverUser2 != null && !"ACTIVE".equals(driverUser2.getStatus())) {
                driverUser2.setStatus("ACTIVE");
                userRepository.save(driverUser2);
            }
        }

        // Seed system admin user
        User sysAdmin = null;
        if (!userRepository.existsByEmail("sysadmin@vitaguard.com")) {
            sysAdmin = new User("SYS_01", "sysadmin@vitaguard.com", passwordEncoder.encode("password"), "SYSTEM_ADMIN");
            sysAdmin.setStatus("ACTIVE");
            sysAdmin.setFullName("System Admin");
            sysAdmin.setPhone("9880001122");
            userRepository.save(sysAdmin);
            System.out.println("[SEED] Test system admin seeded successfully.");
        } else {
            sysAdmin = userRepository.findByEmail("sysadmin@vitaguard.com").orElse(null);
            if (sysAdmin != null && !"ACTIVE".equals(sysAdmin.getStatus())) {
                sysAdmin.setStatus("ACTIVE");
                userRepository.save(sysAdmin);
            }
        }

        // Seed hospitals if empty
        if (hospitalRepository.count() == 0) {
            // Seed Apollo Hospital
            Hospital apollo = new Hospital("Apollo Hospital", 12.9252, 77.6011, 100, 85, 30, 12, 4.8);
            hospitalRepository.save(apollo);
            seedDepartments(apollo, List.of("Cardiology", "Trauma", "General Medicine", "Emergency"));
            
            Doctor doc1 = seedDoctor(apollo, "Dr. R G Sakthivelan", "9880123456", "Cardiology", "Cardiology");
            Doctor doc2 = seedDoctor(apollo, "Dr. Sarah D'souza", "9880654321", "Trauma Care", "Trauma");
            Doctor doc3 = seedDoctor(apollo, "Dr. Ramesh Babu", "9887766554", "Internal Medicine", "General Medicine");

            // Link doctor user to doctor profile
            if (doctorUser != null && doc1 != null) {
                doctorUser.setHospitalId(apollo.getId());
                doctorUser.setDoctorId(doc1.getId());
                userRepository.save(doctorUser);
            }

            // Link hospital admin to Apollo Hospital
            if (hospitalAdmin != null) {
                hospitalAdmin.setHospitalId(apollo.getId());
                userRepository.save(hospitalAdmin);
            }

            // Seed Fortis Hospital
            Hospital fortis = new Hospital("Fortis Hospital", 12.9611, 77.6387, 80, 40, 25, 18, 4.5);
            hospitalRepository.save(fortis);
            seedDepartments(fortis, List.of("Orthopedics", "General Medicine", "Trauma", "Emergency"));
            seedDoctor(fortis, "Dr. Kavita Nair", "9770112233", "Orthopedics", "Orthopedics");
            seedDoctor(fortis, "Dr. Michael Chen", "9772233445", "General Surgery", "General Medicine");
            seedDoctor(fortis, "Dr. Priyanshu Jha", "9773344556", "Emergency Medicine", "Emergency");

            // Seed Manipal Hospital
            Hospital manipal = new Hospital("Manipal Hospital", 12.9591, 77.6473, 120, 110, 40, 35, 4.7);
            hospitalRepository.save(manipal);
            seedDepartments(manipal, List.of("Neurology", "Pediatrics", "General Medicine", "Emergency"));
            seedDoctor(manipal, "Dr. Sumanth Shetty", "9661122334", "Neurology", "Neurology");
            seedDoctor(manipal, "Dr. Deepa Rao", "9662233445", "Pediatrics", "Pediatrics");
            seedDoctor(manipal, "Dr. Aditi Verma", "9663344556", "General Physician", "General Medicine");

            // Seed Narayana Health
            Hospital narayana = new Hospital("Narayana Health", 12.8938, 77.5949, 150, 10, 50, 5, 4.9);
            hospitalRepository.save(narayana);
            seedDepartments(narayana, List.of("Oncology", "Cardiology", "Pulmonology", "Emergency"));
            seedDoctor(narayana, "Dr. AR Reddy", "9551122334", "Oncology", "Oncology");
            seedDoctor(narayana, "Dr. Vikram Singh", "9552233445", "Cardiac Surgery", "Cardiology");
            seedDoctor(narayana, "Dr. Sneha Patil", "9553344556", "Cardiology", "Cardiology");

            // Seed St. John's Hospital
            Hospital stJohns = new Hospital("St. John's Hospital", 12.9353, 77.6174, 200, 150, 60, 40, 4.3);
            hospitalRepository.save(stJohns);
            seedDepartments(stJohns, List.of("General Medicine", "Emergency", "Trauma"));
            seedDoctor(stJohns, "Dr. John Doe", "9441122334", "Emergency Medicine", "Emergency");
            seedDoctor(stJohns, "Dr. Maria Garcia", "9442233445", "Trauma Surgery", "Trauma");
            seedDoctor(stJohns, "Dr. Rajesh Khanna", "9443344556", "General Physician", "General Medicine");

            System.out.println("[SEED] Seeded 5 hospitals, departments, and doctors successfully.");
        }

        // Ensure hospital admin is linked to Apollo Hospital (idempotent)
        Hospital apollo = hospitalRepository.findByName("Apollo Hospital").orElse(null);
        if (apollo != null && hospitalAdmin != null && !apollo.getId().equals(hospitalAdmin.getHospitalId())) {
            hospitalAdmin.setHospitalId(apollo.getId());
            userRepository.save(hospitalAdmin);
            System.out.println("[SEED] Linked hospital admin to Apollo Hospital.");
        }

        // Ensure doctor user is linked to Apollo Hospital and Doctor 1 (idempotent)
        if (apollo != null && doctorUser != null) {
            Doctor doc1 = doctorRepository.findByHospitalId(apollo.getId()).stream().findFirst().orElse(null);
            if (doc1 != null && (!doc1.getId().equals(doctorUser.getDoctorId()) || !apollo.getId().equals(doctorUser.getHospitalId()))) {
                doctorUser.setHospitalId(apollo.getId());
                doctorUser.setDoctorId(doc1.getId());
                userRepository.save(doctorUser);
                System.out.println("[SEED] Linked doctor user to Apollo Hospital Doctor " + doc1.getId() + " (" + doc1.getName() + ").");
            }
        }

        // Seed ambulances if empty
        if (ambulanceRepository.count() == 0) {
            // Seed ambulances located initially at respective hospitals
            Ambulance amb1 = new Ambulance("AMB-01", "Apollo Hospital", 12.9252, 77.6011);
            Ambulance amb2 = new Ambulance("AMB-02", "Fortis Hospital", 12.9611, 77.6387);
            Ambulance amb3 = new Ambulance("AMB-03", "Manipal Hospital", 12.9591, 77.6473);
            Ambulance amb4 = new Ambulance("AMB-04", "Narayana Health", 12.8938, 77.5949);
            Ambulance amb5 = new Ambulance("AMB-05", "St. John's Hospital", 12.9353, 77.6174);

            ambulanceRepository.save(amb1);
            ambulanceRepository.save(amb2);
            ambulanceRepository.save(amb3);
            ambulanceRepository.save(amb4);
            ambulanceRepository.save(amb5);

            // Link driver to ambulance AMB-01 (Apollo Hospital)
            if (driverUser != null && amb1 != null) {
                amb1.setDriver(driverUser);
                driverUser.setAmbulanceId(amb1.getId());
                ambulanceRepository.save(amb1);
                userRepository.save(driverUser);
                System.out.println("[SEED] Linked ambulance driver to AMB-01 (Apollo Hospital).");
            }

            System.out.println("[SEED] Seeded 5 ambulances successfully.");
        }

        // Ensure ambulance driver is linked to AMB-01 (idempotent)
        Ambulance amb1 = ambulanceRepository.findByUnitId("AMB-01").orElse(null);
        if (amb1 != null && driverUser != null && !amb1.getId().equals(driverUser.getAmbulanceId())) {
            amb1.setDriver(driverUser);
            driverUser.setAmbulanceId(amb1.getId());
            ambulanceRepository.save(amb1);
            userRepository.save(driverUser);
            System.out.println("[SEED] Linked ambulance driver to AMB-01 (Apollo Hospital).");
        }

        // Ensure second ambulance driver is linked to AMB-02 (idempotent)
        Ambulance amb2 = ambulanceRepository.findByUnitId("AMB-02").orElse(null);
        if (amb2 != null && driverUser2 != null && !amb2.getId().equals(driverUser2.getAmbulanceId())) {
            amb2.setDriver(driverUser2);
            driverUser2.setAmbulanceId(amb2.getId());
            ambulanceRepository.save(amb2);
            userRepository.save(driverUser2);
            System.out.println("[SEED] Linked second ambulance driver to AMB-02 (Fortis Hospital).");
        }

        // Create family-patient relationship
        if (patient != null && familyMember != null) {
            if (!relationshipRepository.existsByPatientIdAndFamilyUserIdAndActiveTrue(patient.getId(), familyMember.getId())) {
                PatientFamilyRelationship rel = new PatientFamilyRelationship(
                        patient, familyMember, "Spouse", "9876543210", true);
                relationshipRepository.save(rel);
                System.out.println("[SEED] Family-patient relationship created successfully.");
            }
        }
    }

    private void seedDepartments(Hospital hospital, List<String> activeSpecs) {
        // Standard list of departments to initialize
        List<String> allDeps = List.of("Emergency", "Cardiology", "Neurology", "Pulmonology", "Orthopedics", "Trauma", "General Medicine", "Pediatrics");
        for (String depName : allDeps) {
            boolean active = activeSpecs.contains(depName) || "Emergency".equals(depName);
            HospitalDepartment dep = new HospitalDepartment(
                    hospital,
                    depName,
                    active, // available
                    active, // emergencyService
                    active, // acceptingPatients
                    hospital.getAvailableBeds() / 8,
                    hospital.getTotalBeds() / 8,
                    hospital.getAvailableDoctors() / 8,
                    hospital.getTotalDoctors() / 8
            );
            hospitalDepartmentRepository.save(dep);
        }
    }

    private Doctor seedDoctor(Hospital hospital, String name, String phone, String specialization, String depName) {
        Doctor doc = new Doctor(hospital, name, phone, specialization, depName, true, true);
        doctorRepository.save(doc);
        return doc;
    }
}
