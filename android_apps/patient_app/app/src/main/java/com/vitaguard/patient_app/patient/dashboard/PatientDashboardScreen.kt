package com.vitaguard.patient_app.patient.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDashboardScreen(
    onNavigateToMedAi: () -> Unit,
    onNavigateToReport: () -> Unit,
    onNavigateToSos: () -> Unit,
    onNavigateToTelehealth: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "VITALGUARD", 
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Black
                    ) 
                },
                actions = {
                    Button(
                        onClick = onNavigateToSos,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("SOS", fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            Text("System Status", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
            Text("MONITORING ACTIVE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Vitals Grid Placeholder
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                VitalCard(title = "HEART RATE", value = "72", unit = "bpm")
                VitalCard(title = "SPO2", value = "98", unit = "%")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                VitalCard(title = "BLOOD PRESSURE", value = "120/80", unit = "mmHg")
                VitalCard(title = "GLUCOSE", value = "95", unit = "mg/dL")
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // Predictive Health / Actions
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Predictive Health Analysis", style = MaterialTheme.typography.titleLarge)
                    Text("Cardiovascular trend is stabilizing.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Button(onClick = onNavigateToMedAi, modifier = Modifier.fillMaxWidth()) {
                        Text("Ask MedAI")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = onNavigateToReport, 
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                    ) {
                        Text("VIEW FULL REPORT")
                    }
                }
            }
        }
    }
}

@Composable
fun VitalCard(title: String, value: String, unit: String) {
    Card(
        modifier = Modifier.width(160.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                Spacer(modifier = Modifier.width(4.dp))
                Text(unit, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
