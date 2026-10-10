# AI Predictive Monitoring Integration Tasks

- `[x]` Install Python ML libraries in simulator venv
- `[x]` Create Python AI Model training script (`train_model.py`) and run it
- `[x]` Create Python AI Service script (`ai_service.py`)
- `[x]` Create Spring Boot `AIHealthAssessmentService.java`
- `[x]` Create Spring Boot `AIHealthAssessmentController.java`
- `[x]` Integrate `AIHealthAssessmentService` into `VitalsController.java` and broadcast updates via STOMP WebSockets
- `[x]` Redesign Patient Portal (`UserDashboard.jsx`) to render AI Health Monitor panels
- `[x]` Redesign Doctor/Hospital Portals (`HealthcareDashboard.jsx`) to show AI Clinical Insights & AI Risk Queue
- `[x]` Write Java unit tests for baseline, Z-score, risk classification and graceful fallback
- `[x]` Run all Maven unit tests and check frontend builds
- `[x]` Update `verify_all_scenarios.py` with AI integration validation scenarios and verify all tests pass
