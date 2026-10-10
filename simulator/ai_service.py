import os
import joblib
import numpy as np
from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

# Load model
MODEL_PATH = "ai_model/model.pkl"
clf = None
if os.path.exists(MODEL_PATH):
    clf = joblib.load(MODEL_PATH)
    print(f"[AI SERVICE] Loaded Random Forest model from {MODEL_PATH}")
else:
    print(f"[AI SERVICE] WARNING: Model file not found at {MODEL_PATH}")

def calculate_slope(values):
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    try:
        slope, _ = np.polyfit(x, values, 1)
        return float(slope)
    except:
        return 0.0

@app.route("/predict", methods=["POST"])
def predict():
    if clf is None:
        return jsonify({"error": "Model not loaded"}), 500
        
    data = request.get_json() or {}
    current_hr = float(data.get("heartRate", 75.0))
    current_spo2 = float(data.get("spo2", 98.0))
    current_temp = float(data.get("temperature", 36.6))
    history = data.get("history") or []
    
    # Process history
    prev_hr = 75.0
    prev_spo2 = 98.0
    prev_temp = 36.6
    time_interval = 5.0 # default 5 minutes
    
    hr_list = [current_hr]
    spo2_list = [current_spo2]
    temp_list = [current_temp]
    
    # Extract historical vectors
    if len(history) > 0:
        # Parse last reading as prev
        last_reading = history[0]
        prev_hr = float(last_reading.get("heartRate", 75.0))
        prev_spo2 = float(last_reading.get("spo2", 98.0))
        prev_temp = float(last_reading.get("temperature", 36.6))
        
        # Calculate time interval
        try:
            current_time = datetime.now()
            if "recordedAt" in last_reading:
                # Handle iso format
                time_str = last_reading["recordedAt"].replace("Z", "")
                if "." in time_str:
                    time_str = time_str.split(".")[0]
                prev_time = datetime.fromisoformat(time_str)
                time_interval = max(1.0, (current_time - prev_time).total_seconds() / 60.0)
        except Exception as e:
            print(f"[AI SERVICE] Time parsing error: {e}")
            
        for r in history[:5]: # look back up to 5 readings
            hr_list.append(float(r.get("heartRate", 75.0)))
            spo2_list.append(float(r.get("spo2", 98.0)))
            temp_list.append(float(r.get("temperature", 36.6)))
            
    hr_change = current_hr - prev_hr
    spo2_change = current_spo2 - prev_spo2
    temp_change = current_temp - prev_temp
    
    hr_mavg = sum(hr_list) / len(hr_list)
    spo2_mavg = sum(spo2_list) / len(spo2_list)
    temp_mavg = sum(temp_list) / len(temp_list)
    
    hr_trend = calculate_slope(hr_list[::-1])
    spo2_trend = calculate_slope(spo2_list[::-1])
    temp_trend = calculate_slope(temp_list[::-1])
    
    num_abnormal = 0
    for h in [current_hr] + [r.get("heartRate", 75.0) for r in history]:
        if h > 90 or h < 60:
            num_abnormal += 1
            break
    for s in [current_spo2] + [r.get("spo2", 98.0) for r in history]:
        if s < 94:
            num_abnormal += 1
            break
    for t in [current_temp] + [r.get("temperature", 36.6) for r in history]:
        if t > 37.6 or t < 36.0:
            num_abnormal += 1
            break
            
    features = np.array([[
        current_hr, current_spo2, current_temp,
        prev_hr, prev_spo2, prev_temp,
        hr_change, spo2_change, temp_change,
        hr_mavg, spo2_mavg, temp_mavg,
        hr_trend, spo2_trend, temp_trend,
        float(num_abnormal), time_interval
    ]])
    
    prob = float(clf.predict_proba(features)[0][1])
    
    risk_level = "LOW"
    if prob >= 0.70:
        risk_level = "HIGH"
    elif prob >= 0.30:
        risk_level = "MODERATE"
        
    explanations = []
    if spo2_trend < -0.1:
        explanations.append("SpO₂ has decreased continuously over recent readings")
    if hr_trend > 0.3:
        explanations.append("Heart rate shows a steep upward trend")
    if current_spo2 < 93.0:
        explanations.append("Oxygen levels are below safe threshold")
    if current_hr > 100.0:
        explanations.append("Tachycardia (elevated heart rate) registered")
    if current_temp > 38.0:
        explanations.append("Hyperthermia (elevated body temperature) registered")
    if num_abnormal >= 2:
        explanations.append("Multiple abnormal metrics detected in monitoring window")
        
    if len(explanations) == 0:
        explanations.append("Vitals are stable and consistent with patient historical averages")
        
    return jsonify({
        "deteriorationProbability": prob,
        "riskLevel": risk_level,
        "predictionWindowMinutes": 10,
        "explanation": explanations
    })

if __name__ == "__main__":
    app.run(port=8001, host="0.0.0.0")
