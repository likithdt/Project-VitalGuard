import requests
import json
import time

BASE_URL = "http://localhost:8000"

def login(email, password="password"):
    res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["token"]

def main():
    print("=== TESTING LIVE AMBULANCE NAVIGATION & 8-STAGE WORKFLOW ===")
    
    # 1. Login actors
    patient_token = login("patient@vitaguard.com")
    doctor_token = login("doctor@vitaguard.com")
    sysadmin_token = login("sysadmin@vitaguard.com")
    driver1_token = login("ambulance-driver@vitalguard.com")
    
    headers_pat = {"Authorization": f"Bearer {patient_token}", "Content-Type": "application/json"}
    headers_doc = {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}
    headers_sys = {"Authorization": f"Bearer {sysadmin_token}", "Content-Type": "application/json"}
    headers_drv = {"Authorization": f"Bearer {driver1_token}", "Content-Type": "application/json"}

    # Cleanup stale emergencies
    try:
        existing = requests.get(f"{BASE_URL}/api/emergency/active", headers=patient_headers if 'patient_headers' in locals() else headers_pat).json()
        for e in existing:
            requests.post(f"{BASE_URL}/api/emergencies/{e['id']}/resolve", headers=sysadmin_token if 'sysadmin_token' in locals() else headers_sys)
    except Exception:
        pass

    # 2. Create emergency with Doctor/Staff
    print("\n1. Creating Emergency...")
    sos_res = requests.post(f"{BASE_URL}/api/emergencies", json={
        "patientUid": "LKT01",
        "description": "Acute chest pain & cardiogenic distress",
        "severity": "CRITICAL",
        "riskScore": 95,
        "latitude": 12.9260,
        "longitude": 77.6010
    }, headers=headers_doc)
    assert sos_res.status_code == 201, f"Failed to create emergency: {sos_res.text}"
    emergency = sos_res.json()
    emergency_id = emergency["id"]
    print(f"✓ Emergency created with ID: {emergency_id}, Status: {emergency['status']}")

    # 3. Hospital acceptance
    if emergency["status"] == "PENDING_HOSPITAL_ACCEPTANCE":
        print("Hospital accepting emergency...")
        h_acc = requests.post(f"{BASE_URL}/api/emergency/{emergency_id}/accept", headers=headers_sys)
        assert h_acc.status_code == 200
        print(f"✓ Hospital accepted: {h_acc.json()['status']}")

    # 4. Doctor decides Ambulance is REQUIRED
    print("Doctor deciding ambulance is REQUIRED...")
    req_amb_res = requests.post(f"{BASE_URL}/api/emergencies/{emergency_id}/ambulance-decision",
                                json={"requiresAmbulance": True}, headers=headers_doc)
    assert req_amb_res.status_code == 200
    print(f"✓ Ambulance requested. Emergency status: {req_amb_res.json()['status']}")

    # 5. Driver fetches pending requests and accepts
    print("\n2. Driver fetching pending requests...")
    pend_res = requests.get(f"{BASE_URL}/api/ambulance/pending-requests", headers=headers_drv)
    assert pend_res.status_code == 200
    pending_list = pend_res.json()
    assert len(pending_list) > 0, "No pending requests found for driver"
    target_req = next(r for r in pending_list if r["emergencyId"] == emergency_id)
    req_id = target_req["id"]
    print(f"✓ Found incoming dispatch request ID: {req_id}")

    print("Driver accepting dispatch request...")
    acc_res = requests.post(f"{BASE_URL}/api/ambulance/requests/{req_id}/accept", headers=headers_drv)
    assert acc_res.status_code == 200
    print(f"✓ Dispatch accepted by driver. Status: {acc_res.json()['status']}")

    # 6. Verify GET /api/ambulance/current-job
    print("\n3. Testing GET /api/ambulance/current-job...")
    job_res = requests.get(f"{BASE_URL}/api/ambulance/current-job", headers=headers_drv)
    assert job_res.status_code == 200
    job_data = job_res.json()
    assert job_data["emergency"]["id"] == emergency_id
    assert job_data["ambulance"]["status"] in ("ACCEPTED", "DRIVER_ACCEPTED")
    print(f"✓ current-job returned emergency SOS-{emergency_id}, unit: {job_data['ambulance']['unitId']}, status: {job_data['ambulance']['status']}")

    # 7. Start Journey
    print("\n4. Testing POST /api/ambulance/start-journey...")
    start_res = requests.post(f"{BASE_URL}/api/ambulance/start-journey", json={"latitude": 12.9650, "longitude": 77.5850}, headers=headers_drv)
    assert start_res.status_code == 200, f"start-journey failed: {start_res.text}"
    start_data = start_res.json()
    assert start_data["status"] == "EN_ROUTE_TO_PATIENT"
    print(f"✓ Journey started successfully: {start_data['status']}")

    # 8. Test GET /api/ambulance/journey-coordinates
    print("\n5. Testing GET /api/ambulance/journey-coordinates...")
    coord_res = requests.get(f"{BASE_URL}/api/ambulance/journey-coordinates", headers=headers_drv)
    assert coord_res.status_code == 200
    coord_data = coord_res.json()
    assert coord_data["pickupLat"] is not None
    assert coord_data["pickupLng"] is not None
    print(f"✓ Journey coordinates verified: Pickup=({coord_data['pickupLat']}, {coord_data['pickupLng']}), Hospital=({coord_data.get('hospitalLat')}, {coord_data.get('hospitalLng')})")

    # 9. Test POST /api/ambulance/location with heading & speed (persists in AmbulanceLocationLog)
    print("\n6. Testing POST /api/ambulance/location with GPS telemetry...")
    loc_res = requests.post(f"{BASE_URL}/api/ambulance/location", json={
        "latitude": 12.9400,
        "longitude": 77.5920,
        "heading": 85.5,
        "speed": 42.0
    }, headers=headers_drv)
    assert loc_res.status_code == 200, f"Location update failed: {loc_res.text}"
    print(f"✓ Location updated with heading 85.5° and speed 42.0 km/h")

    # 10. Test GET /api/ambulance/location
    print("\n7. Testing GET /api/ambulance/location...")
    my_loc_res = requests.get(f"{BASE_URL}/api/ambulance/location", headers=headers_drv)
    assert my_loc_res.status_code == 200
    my_loc = my_loc_res.json()
    assert my_loc["latitude"] == 12.9400
    assert my_loc["longitude"] == 77.5920
    print(f"✓ Ambulance location verified: ({my_loc['latitude']}, {my_loc['longitude']})")

    # 11. Test Stage Transitions (8-stage flow)
    print("\n8. Testing status progression through remaining transit stages...")
    stages = [
        ("ARRIVED_AT_PATIENT", "Arrived at Patient"),
        ("PATIENT_ONBOARD", "Patient Onboard"),
        ("EN_ROUTE_TO_HOSPITAL", "En Route to Hospital"),
        ("ARRIVED_AT_HOSPITAL", "Arrived at Hospital")
    ]
    for status_code, label in stages:
        st_res = requests.post(f"{BASE_URL}/api/ambulance/status", json={"status": status_code}, headers=headers_drv)
        assert st_res.status_code == 200, f"Transition to {status_code} failed: {st_res.text}"
        print(f"✓ Advanced to: {status_code} ({label})")

    # 12. Complete Journey
    print("\n9. Testing POST /api/ambulance/complete-journey...")
    comp_res = requests.post(f"{BASE_URL}/api/ambulance/complete-journey", headers=headers_drv)
    assert comp_res.status_code == 200, f"complete-journey failed: {comp_res.text}"
    print(f"✓ Journey completed successfully: {comp_res.json()['status']}")

    # 13. Verify ambulance unit is freed to AVAILABLE
    free_res = requests.get(f"{BASE_URL}/api/ambulance/location", headers=headers_drv)
    assert free_res.status_code == 200
    assert free_res.json()["status"] == "AVAILABLE"
    assert free_res.json()["currentEmergencyId"] is None
    print(f"✓ Ambulance unit is now freed: status={free_res.json()['status']}, currentEmergencyId={free_res.json()['currentEmergencyId']}")

    # Resolve emergency
    requests.post(f"{BASE_URL}/api/emergencies/{emergency_id}/resolve", headers=headers_doc)
    print("\n=======================================================")
    print("ALL LIVE NAVIGATION & 8-STAGE ENDPOINTS VERIFIED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    main()
