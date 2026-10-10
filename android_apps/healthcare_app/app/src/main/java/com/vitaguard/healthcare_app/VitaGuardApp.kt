package com.vitaguard.healthcare_app

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vitaguard.healthcare_app.core.auth.LoginScreen
import com.vitaguard.healthcare_app.core.auth.SplashScreen

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Login : Screen("login")
    object DoctorDashboard : Screen("doctor_dashboard")
    object AdminDashboard : Screen("admin_dashboard")
    object PatientManagement : Screen("patient_management")
    object Appointment : Screen("appointment")
    object Prescription : Screen("prescription")
    object StaffManagement : Screen("staff_management")
    object FacilitySettings : Screen("facility_settings")
}

@Composable
fun VitaGuardApp() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Screen.Splash.route) {
        composable(Screen.Splash.route) {
            SplashScreen(onSplashFinished = {
                navController.navigate(Screen.Login.route) {
                    popUpTo(Screen.Splash.route) { inclusive = true }
                }
            })
        }
        composable(Screen.Login.route) {
            LoginScreen(onLoginSuccess = { role ->
                val destination = if (role == "DOCTOR") {
                    Screen.DoctorDashboard.route
                } else {
                    Screen.AdminDashboard.route
                }
                navController.navigate(destination) {
                    popUpTo(Screen.Login.route) { inclusive = true }
                }
            })
        }
        composable(Screen.DoctorDashboard.route) {
            com.vitaguard.healthcare_app.doctor.dashboard.DoctorDashboardScreen(
                onNavigateToPatients = { navController.navigate(Screen.PatientManagement.route) },
                onNavigateToAppointments = { navController.navigate(Screen.Appointment.route) },
                onNavigateToPrescriptions = { navController.navigate(Screen.Prescription.route) }
            )
        }
        composable(Screen.PatientManagement.route) {
            com.vitaguard.healthcare_app.doctor.patients.PatientManagementScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Appointment.route) {
            com.vitaguard.healthcare_app.doctor.appointments.AppointmentScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Prescription.route) {
            com.vitaguard.healthcare_app.doctor.prescriptions.PrescriptionScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.AdminDashboard.route) {
            com.vitaguard.healthcare_app.admin.dashboard.AdminDashboardScreen(
                onNavigateToStaff = { navController.navigate(Screen.StaffManagement.route) },
                onNavigateToSettings = { navController.navigate(Screen.FacilitySettings.route) }
            )
        }
        composable(Screen.StaffManagement.route) {
            com.vitaguard.healthcare_app.admin.staff.StaffManagementScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.FacilitySettings.route) {
            com.vitaguard.healthcare_app.admin.settings.FacilitySettingsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
