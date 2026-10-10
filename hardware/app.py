import os
import time
import requests
import joblib
import pandas as pd

# ==========================================
# Configuration
# ==========================================
# Replace with your ESP32's actual Wi-Fi IP address
ESP32_IP = os.environ.get("ESP32_IP", "192.168.1.50")

# VitalGuard Spring Boot Backend Configuration
VITALGUARD_URL = os.environ.get("VITALGUARD_URL", "http://localhost:8000/api/vitals")
VITALGUARD_JWT = os.environ.get(
    "VITALGUARD_JWT",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJMS1QwMSIsImlhdCI6MTc5MTY1MDYyOSwiZXhwIjoxNzkxNzM3MDI5fQ.n73J4imA0pM7kGACfZ66JLmRGCDbJ0e-xr4Co1js8iI"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "health_model.pkl")
ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder.pkl")

# Load ML artifacts if present
try:
    model = joblib.load(MODEL_PATH)
    encoder = joblib.load(ENCODER_PATH)
    print("[VitalGuard Bridge] Health ML Model loaded successfully.")
except Exception as e:
    model = None
    encoder = None
    print(f"[VitalGuard Bridge] ML files not found ({e}). Using rule fallback.")


def forward_to_vitalguard(heart_rate, spo2, temperature=36.6, systolic=120.0, diastolic=80.0):
    """Pushes live vitals into Spring Boot -> MySQL -> React WebSockets"""
    if not VITALGUARD_JWT:
        print("[VitalGuard Bridge] Error: VITALGUARD_JWT is not set.")
        return

    payload = {
        "heart_rate": float(heart_rate),
        "spO2": float(spo2),
        "bp_systolic": float(systolic),
        "bp_diastolic": float(diastolic),
        "glucose": 100.0,
        "temperature": float(temperature),
        "respiratory_rate": 16.0,
        "latitude": 12.9716,
        "longitude": 77.5946
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {VITALGUARD_JWT.strip()}"
    }

    try:
        res = requests.post(VITALGUARD_URL, json=payload, headers=headers, timeout=3)
        if res.status_code in (200, 201):
            print(f"[VitalGuard Bridge] Sent to React Dashboard -> HR: {heart_rate} BPM | SpO2: {spo2}%")
        else:
            print(f"[VitalGuard Bridge] Backend rejected payload ({res.status_code}): {res.text}")
    except requests.exceptions.RequestException as err:
        print(f"[VitalGuard Bridge] Connection error to Spring Boot: {err}")


def stream_hardware():
    print(f"[VitalGuard Bridge] Starting live telemetry stream from ESP32 at {ESP32_IP}...")
    print(f"[VitalGuard Bridge] Streaming directly into React Dashboard (http://localhost:5173)...\n")

    sensor_endpoint = f"http://{ESP32_IP}/api/health"

    while True:
        try:
            # Poll sensor data from physical ESP32
            response = requests.get(sensor_endpoint, timeout=2)
            if response.status_code == 200:
                data = response.json()
                hr = float(data.get("heart_rate", 0))
                spo2 = float(data.get("spo2", 0))
                temp = float(data.get("temperature", 36.6))

                # If finger is placed on the sensor and receiving valid readings
                if hr > 30 and spo2 > 70:
                    forward_to_vitalguard(hr, spo2, temp)
                else:
                    print(f"[VitalGuard Bridge] Awaiting finger on sensor... (Raw HR={hr}, SpO2={spo2}%)", end="\r")

        except requests.exceptions.RequestException:
            print(f"[VitalGuard Bridge] Searching for ESP32 at {sensor_endpoint}...", end="\r")

        time.sleep(2)


if __name__ == "__main__":
    stream_hardware()