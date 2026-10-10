package com.vitaguard.patient_app.patient.sos

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SosScreen(onBack: () -> Unit) {
    var sosActive by remember { mutableStateOf(false) }
    var countdown by remember { mutableStateOf(5) }

    LaunchedEffect(sosActive) {
        if (sosActive && countdown > 0) {
            while (countdown > 0 && sosActive) {
                delay(1000)
                countdown--
            }
            if (countdown == 0) {
                // TODO: Trigger actual SOS API and Ambulance Dispatch
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Emergency SOS", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    TextButton(onClick = {
                        sosActive = false
                        onBack()
                    }) {
                        Text("Back")
                    }
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
            Text("Press to request immediate assistance.", style = MaterialTheme.typography.titleMedium)
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Box(
                modifier = Modifier
                    .size(200.dp)
                    .clip(CircleShape)
                    .background(if (sosActive) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.Center
            ) {
                Button(
                    onClick = { 
                        sosActive = !sosActive 
                        if (sosActive) countdown = 5
                    },
                    modifier = Modifier.fillMaxSize(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        contentColor = MaterialTheme.colorScheme.onError
                    )
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = if (sosActive) countdown.toString() else "SOS", 
                            fontSize = 48.sp, 
                            fontWeight = FontWeight.Black
                        )
                        if (sosActive) {
                            Text("Tap to Cancel", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            if (sosActive && countdown == 0) {
                Text(
                    "AMBULANCE DISPATCHED", 
                    color = MaterialTheme.colorScheme.error, 
                    style = MaterialTheme.typography.headlineMedium, 
                    fontWeight = FontWeight.Bold
                )
                Text("ETA: 8 minutes", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(16.dp))
                
                // Placeholder for Map
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Text("[ Live Map Tracking Placeholder ]")
                }
            } else {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Nearby Hospitals", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("1. City General Hospital (1.2 mi)", style = MaterialTheme.typography.bodyMedium)
                        Text("2. Westside Medical Center (3.4 mi)", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
