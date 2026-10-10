# VitalGuard — Project Technical Report

## Overview
VitalGuard is a **Health Command & Telemetry Network** — a full-stack emergency medical response platform connecting patients, hospitals, ambulances, and healthcare providers in real-time. It combines deterministic clinical rules with AI/ML-assisted risk scoring to automate emergency triage, hospital recommendation, and ambulance dispatch.

---

## Architecture Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Spring Boot 4.1.0, Java 21, Spring Security (JWT), Spring Data JPA, MySQL 9.1, WebSocket (STOMP) |
| **Frontend** | React 18 + Vite, React Router, Axios, Chart.js / SVG custom charts, Tailwind-like custom CSS |
| **Mobile** | Android (Kotlin) — Patient App + Healthcare Provider App |
| **AI/ML Service** | Python microservice (port 8001) — deterioration prediction model |
| **Infrastructure** | Maven, Docker-ready, HikariCP connection pooling |

---

## AI / ML Components

### 1. Deterministic Clinical Rule Engine (`DeterministicRiskAnalysisService`)
**Location:** `backend-java/src/main/java/com/vitaguard/backend_java/medical/DeterministicRiskAnalysisService.java`

**How it works:**
- Pure Java implementation — zero external dependencies
- Evaluates vitals (HR, SpO₂, Temperature) against clinical thresholds
- Adds trend analysis (rate-of-change detection) from vital history
- Produces: `riskScore (0-100)`, `severity (LOW/MODERATE/HIGH/CRITICAL)`, `anomaly list`, `explanation text`

**Scoring Logic:**
| Vital | Critical (+40) | High (+15-20) | Moderate (+10) |
|-------|----------------|---------------|----------------|
| Heart Rate | >140 or <40 | >100 or <50 | — |
| SpO₂ | <85% | <92% | <95% |
| Temperature | >39.5°C or <35°C | >38°C | — |

**Trend bonuses:** Rapid SpO₂ drop ≥3% (+15), sudden HR change ≥20 BPM (+15), temp change ≥1°C (+10)

---

### 2. Personalized Baseline & Anomaly Detection (`AIHealthAssessmentService.calculateBaselineAndAnomaly`)
**Location:** `backend-java/src/main/java/com/vitaguard/backend_java/medical/AIHealthAssessmentService.java:132-186`

**How it works:**
- Computes per-patient rolling statistics from last 30 vitals (minimum 3 readings)
- Calculates mean (μ) and standard deviation (σ) for HR, SpO₂, Temperature
- Applies Z-score anomaly detection: `|x - μ| / σ > 2.0` = anomaly
- Outputs: `anomalyScore (0-100)`, `anomalyDetected (boolean)`, personalized baseline ranges (μ ± 1.5σ)

**Minimum σ floors:** HR ≥ 3.0, SpO₂ ≥ 1.0, Temp ≥ 0.2 (prevents division by zero on stable patients)

---

### 3. Python ML Microservice — Deterioration Prediction
**Location:** Called via `RestTemplate` at `http://localhost:8001/predict` (see `AIHealthAssessmentService.java:63`)

**How it works:**
- **Input:** Current vitals (HR, SpO₂, Temp) + 30-point history time series
- **Output:** `deteriorationProbability (0.0-1.0)`, `explanation[]` (SHAP-style feature attributions)
- **Timeouts:** 1.5s connect / 1.5s read — graceful fallback to deterministic-only mode
- **Fallback:** If Python service unreachable, `deteriorationProbability = 0.0`, explanation: "AI service offline - operating in deterministic safety mode"

**Risk Fusion Formula (line 84):**
```
finalScore = (ruleScore × 0.40) + (deteriorationProbability × 100 × 0.40) + (anomalyScore × 0.20)
```
- 40% deterministic clinical rules
- 40% ML deterioration probability  
- 20% personalized anomaly score

**Severity bands:** CRITICAL ≥85, HIGH ≥70, MODERATE ≥40, LOW <40

---

### 4. Hospital Recommendation Engine (`HospitalRecommendationService`)
**Location:** `backend-java/src/main/java/com/vitaguard/backend_java/hospital/HospitalRecommendationService.java`

**How it works:**
- Multi-criteria scoring (0-100) for each hospital given patient location + required department
- **Distance (40%)** — inverse distance scoring, ETA estimation at 50 km/h + 3 min buffer
- **Bed capacity (20%)** — >5 beds = 20 pts, 1-5 beds = 10 pts, 0 = 0
- **Doctor availability (20%)** — >1 = 20, 1 = 10, 0 = 0
- **Department status (−50 penalty)** — not accepting patients = heavy penalty
- **Hospital rating (20%)** — 5.0★ = 20 pts, linear scale
- **Fallback logic:** If specialized department unavailable → Emergency department → -30 penalty

**Output:** Ranked list of `HospitalRecommendation` objects with distance, ETA, score, human-readable reasoning string

---

### 5. Ambulance Dispatch & Routing (`AmbulanceService`)
**Location:** `backend-java/src/main/java/com/vitaguard/backend_java/ambulance/AmbulanceService.java`

**How it works:**
- Finds nearest AVAILABLE ambulance by Haversine distance
- Requests ambulance (sets status = REQUESTED, sends WebSocket notification to driver)
- Driver accepts/declines via WebSocket → state machine transitions
- Automatic re-dispatch on decline (next nearest)
- Real-time location broadcasting via WebSocket topics

---

### 6. Emergency Cooldown & Deduplication (`AnomalyDetectionService`)
**Location:** `backend-java/src/main/java/com/vitaguard/backend_java/medical/AnomalyDetectionService.java`

**How it works:**
- Prevents duplicate emergency triggers per patient
- Configurable cooldown (default 10 min, `vitaguard.emergency.cooldown-minutes`)
- Checks: no active emergency + last emergency > cooldown minutes ago

---

## Data Flow Summary

```
Patient vitals POST /api/vitals
        │
        ▼
┌───────────────────────┐
│ AIHealthAssessment    │
│   1. Baseline/Anomaly │◄── Vital history (last 30)
│   2. Python ML call   │◄── Current vitals + history
│   3. Risk Fusion      │
└─────────┬─────────────┘
          │ AIHealthAssessment saved
          ▼
    If severity HIGH/CRITICAL
          │
          ▼
┌───────────────────────┐
│ EmergencyController   │
│   triggerSos()        │◄── Symptoms, location
│   ▼                   │
│ HospitalRecommendation│──► Best hospital + department
│   ▼                   │
│ AmbulanceService      │──► Nearest ambulance dispatch
└───────────────────────┘
```

---

## API Endpoints — AI/ML Surface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ai/patients/{uid}/assessment` | Latest fused AI assessment (riskScore, severity, deteriorationProbability, anomalyScore, trend, explanations) |
| `GET /api/ai/patients/{uid}/forecast` | Deterioration probability + prediction window |
| `GET /api/ai/patients/{uid}/anomalies` | Anomaly score + detection flag |
| `GET /api/ai/patients/{uid}/baseline` | Personalized normal ranges (μ ± 1.5σ) |
| `POST /api/emergency/sos` | Trigger emergency → AI triage → hospital → ambulance |

---

## Authorization Model (Role-Based Data Isolation)

| Role | Data Scope |
|------|------------|
| **PATIENT** | Own vitals, assessments, emergencies, medical profile/history |
| **FAMILY_MEMBER** | Linked patient's data only |
| **DOCTOR** | Assigned emergencies + patients under care |
| **HOSPITAL_ADMIN** | **Only their hospital's** emergencies, beds, doctors, departments |
| **AMBULANCE_DRIVER** | **Only their assigned ambulance** + current job + pending requests |
| **SYSTEM_ADMIN** | Global view (all hospitals, ambulances, emergencies) |

**Enforced in:** `App.jsx ProtectedRoute`, `HospitalController`, `AmbulanceController`, `EmergencyController`, `AIHealthAssessmentController`

---

## Testing & Quality

| Command | Result |
|---------|--------|
| `./mvnw clean test` | ✅ 15 tests pass (AI services, anomaly detection, risk analysis, hospital recommendation, app context) |
| `npm run build` | ✅ Production build successful (425 KB JS, 11 KB CSS) |

---

## Configuration (application.properties)

```properties
# JWT
vitaguard.jwt.secret=9a6563c4e32d56a3782782e4a6a81a7b8e5c8e31a02934ef56782bca8cd5ef9a
vitaguard.jwt.expiration=86400000

# Emergency cooldown
vitaguard.emergency.cooldown-minutes=10

# Python ML service (external)
# Called at http://localhost:8001/predict
```

---

## Seeded Demo Accounts (Idempotent)

| Email | Role | Password | Linked Resource |
|-------|------|----------|-----------------|
| patient@vitaguard.com | PATIENT | password | — |
| family@vitaguard.com | FAMILY_MEMBER | password | Linked to patient |
| doctor@vitaguard.com | DOCTOR | password | Apollo Hospital |
| **hospital-admin@vitalguard.com** | **HOSPITAL_ADMIN** | **password** | **Apollo Hospital** |
| **ambulance-driver@vitalguard.com** | **AMBULANCE_DRIVER** | **password** | **AMB-01 (Apollo)** |
| sysadmin@vitaguard.com | SYSTEM_ADMIN | password | — |

---

## Key Design Decisions

1. **Graceful Degradation** — Python ML service failure never blocks emergency flow; deterministic rules always run
2. **Idempotent Seeding** — `DatabaseSeeder` uses `existsByEmail` checks; safe to restart repeatedly
3. **Backend-Driven Role Routing** — Frontend never decides dashboard; JWT payload (`role`, `hospitalId`, `ambulanceId`) drives navigation
4. **Resource Guardrails** — Missing `hospitalId`/`ambulanceId` returns clear 400 error page instead of empty dashboard
5. **WebSocket Real-time** — STOMP over `/ws/**` for ambulance tracking, emergency updates, doctor/hospital notifications
6. **Audit Trail** — Every emergency state transition persisted with timestamps (`createdAt`, `acceptedAt`, `assignedAt`, `completedAt`)