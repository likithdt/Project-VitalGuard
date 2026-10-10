package com.vitaguard.healthcare_app.doctor.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    onNavigateToPatients: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToPrescriptions: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "DOCTOR PORTAL", 
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Black
                    ) 
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Welcome, Dr. Smith", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Active Shifts: ER Ward 3", color = MaterialTheme.colorScheme.onSurfaceVariant)
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("CRITICAL ALERTS (2)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("• Patient John Doe (Room 12B) - High HR")
                    Text("• Patient Jane Roe (Home) - SOS Triggered")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
            
            Button(
                onClick = onNavigateToPatients,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Text("Patient Management")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onNavigateToAppointments,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Text("My Appointments")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onNavigateToPrescriptions,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
            ) {
                Text("Issue Prescriptions")
            }
        }
    }
}
