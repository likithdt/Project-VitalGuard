import random
import pandas as pd

# Number of samples
NUM_SAMPLES = 10000

data = []

for _ in range(NUM_SAMPLES):

    # Generate random values
    heart_rate = random.randint(30, 180)              # bpm
    spo2 = random.randint(70, 100)                    # %
    temperature = round(random.uniform(21.0, 32.0), 1)  # °C
    pressure = random.randint(500, 1000)              # Sensor Value

    # Label
    if (60 <= heart_rate <= 100 and
        95 <= spo2 <= 100 and
        21 <= temperature <= 32):
        status = "Normal"
    else:
        status = "Critical"

    data.append([
        heart_rate,
        spo2,
        temperature,
        pressure,
        status
    ])

# Create DataFrame
df = pd.DataFrame(data, columns=[
    "Heart_Rate",
    "SpO2",
    "Temperature",
    "Pressure",
    "Health_Status"
])

# Save to Excel
df.to_csv("Health_Monitoring_Dataset.csv", index=False)

print("Dataset Created Successfully!")
print(df["Health_Status"].value_counts())
print(df.head())
