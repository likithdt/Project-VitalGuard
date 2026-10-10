import joblib
import pandas as pd

# ==========================
# Load Model
# ==========================

model = joblib.load("health_model.pkl")
encoder = joblib.load("label_encoder.pkl")

print("=" * 40)
print(" Human Health Condition Prediction ")
print("=" * 40)

# ==========================
# User Input
# ==========================

heart_rate = float(input("Enter Heart Rate (bpm): "))
spo2 = float(input("Enter SpO2 (%): "))
temperature = float(input("Enter Temperature (°C): "))
pressure = float(input("Enter Pressure Value (500-1000): "))

# ==========================
# Create Input Data
# ==========================

sample = pd.DataFrame({
    "Heart_Rate": [heart_rate],
    "SpO2": [spo2],
    "Temperature": [temperature],
    "Pressure": [pressure]
})

# ==========================
# Prediction
# ==========================

prediction = model.predict(sample)
result = encoder.inverse_transform(prediction)[0]

probability = model.predict_proba(sample)
confidence = probability.max() * 100

# ==========================
# Display Result
# ==========================

print("\n" + "=" * 40)
print("Prediction Result")
print("=" * 40)

print(f"Heart Rate : {heart_rate} bpm")
print(f"SpO2       : {spo2} %")
print(f"Temperature: {temperature} °C")
print(f"Pressure   : {pressure}")

print("\nPredicted Condition :", result)
print(f"Confidence          : {confidence:.2f}%")

if result == "Normal":
    print("\nHealth Status : NORMAL")
else:
    print("\nHealth Status : CRITICAL")

print("=" * 40)