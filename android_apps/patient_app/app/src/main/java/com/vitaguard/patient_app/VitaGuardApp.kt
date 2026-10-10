package com.vitaguard.patient_app

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vitaguard.patient_app.core.auth.LoginScreen
import com.vitaguard.patient_app.core.auth.SplashScreen

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Login : Screen("login")
    object PatientDashboard : Screen("patient_dashboard")
    object FamilyDashboard : Screen("family_dashboard")
    object MedAiChat : Screen("med_ai_chat")
    object Medication : Screen("medication")
    object Sos : Screen("sos")
    object MedicalReport : Screen("medical_report")
    object Telehealth : Screen("telehealth")
    object AlertCenter : Screen("alert_center")
    object LocationTracker : Screen("location_tracker")
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
                val destination = if (role == "PATIENT") {
                    Screen.PatientDashboard.route
                } else {
                    Screen.FamilyDashboard.route
                }
                navController.navigate(destination) {
                    popUpTo(Screen.Login.route) { inclusive = true }
                }
            })
        }
        composable(Screen.PatientDashboard.route) {
            com.vitaguard.patient_app.patient.dashboard.PatientDashboardScreen(
                onNavigateToMedAi = { navController.navigate(Screen.MedAiChat.route) },
                onNavigateToReport = { navController.navigate(Screen.MedicalReport.route) },
                onNavigateToSos = { navController.navigate(Screen.Sos.route) },
                onNavigateToTelehealth = { navController.navigate(Screen.Telehealth.route) }
            )
        }
        composable(Screen.FamilyDashboard.route) {
            com.vitaguard.patient_app.family.dashboard.FamilyDashboardScreen(
                onNavigateToAlerts = { navController.navigate(Screen.AlertCenter.route) },
                onNavigateToLocation = { navController.navigate(Screen.LocationTracker.route) },
                onNavigateToReports = { navController.navigate(Screen.MedicalReport.route) }
            )
        }
        composable(Screen.MedAiChat.route) {
            com.vitaguard.patient_app.patient.medai.MedAiChatScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Medication.route) {
            com.vitaguard.patient_app.patient.medication.MedicationScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Sos.route) {
            com.vitaguard.patient_app.patient.sos.SosScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.MedicalReport.route) {
            com.vitaguard.patient_app.patient.report.MedicalReportScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Telehealth.route) {
            com.vitaguard.patient_app.patient.telehealth.TelehealthScreen(
                onEndCall = { navController.popBackStack() }
            )
        }
        composable(Screen.AlertCenter.route) {
            com.vitaguard.patient_app.family.alerts.AlertCenterScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.LocationTracker.route) {
            com.vitaguard.patient_app.family.location.LocationTrackerScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
