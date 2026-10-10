# VitalGuard — Run Guide

## Terminals

### Terminal 1 — Java Spring Boot Backend
```bash
cd backend-java
mvn spring-boot:run
```
The backend runs at `http://localhost:8000`.

### Terminal 2 — React Vite Frontend
```bash
cd frontend
npm run dev
```
The React development server runs at `http://localhost:5173`.

### Terminal 3 — AI Deterioration ML Microservice (Port 8001)
```bash
cd simulator
python3 -m venv venv && source venv/bin/activate
./venv/bin/pip install -r requirements.txt
./venv/bin/python ai_service.py
```
The Python ML service runs at `http://localhost:8001` — **it is a REST API only** (no web UI). Test it:
```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{"heartRate": 145, "spo2": 82, "temperature": 39.8, "history": []}'
```

### Terminal 4 — Simulator & Scenario Verification
```bash
cd simulator
source venv/bin/activate
./venv/bin/python verify_all_scenarios.py
```
*(Note: `verify_all_scenarios.py` will also automatically detect and launch `ai_service.py` if it is not already running).*

## All Integration Requirements Covered
- ✅ Patient Profile / Database Setup (MySQL)
- ✅ Intelligent SOS Classification (Cardiology / Pulmonology / Fallback to Emergency)
- ✅ Hospital Capability / Department Filtering / Routing Fallback
- ✅ Nearest Ambulance Allocation (Location-Based Geolocation matching)
- ✅ Ambulance Dispatch Status Lock (Concurrent prevention)
- ✅ Real-time Coordinate Updates (OSRM routing + SockJS WebSocket Broker)
