package com.vitaguard.patient_app.family.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FamilyDashboardScreen(
    onNavigateToAlerts: () -> Unit,
    onNavigateToLocation: () -> Unit,
    onNavigateToReports: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "FAMILY PORTAL", 
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
            Text("Linked Patient", style = MaterialTheme.typography.titleMedium)
            Text("John Doe", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text("STATUS: STABLE", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Button(
                onClick = onNavigateToAlerts,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Text("Alert Center")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onNavigateToLocation,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Text("Track Location / Ambulance")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onNavigateToReports,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
            ) {
                Text("View Medical Reports")
            }
        }
    }
}
