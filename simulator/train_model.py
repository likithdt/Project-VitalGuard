import os
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import joblib

def generate_synthetic_data(num_samples=2000):
    np.random.seed(42)
    
    # Base normal ranges
    hr = np.random.uniform(55, 140, num_samples)
    spo2 = np.random.uniform(80, 100, num_samples)
    temp = np.random.uniform(35.0, 40.5, num_samples)
    
    prev_hr = hr + np.random.uniform(-15, 15, num_samples)
    prev_spo2 = spo2 + np.random.uniform(-3, 3, num_samples)
    prev_temp = temp + np.random.uniform(-0.8, 0.8, num_samples)
    
    # Clip ranges
    prev_hr = np.clip(prev_hr, 50, 150)
    prev_spo2 = np.clip(prev_spo2, 75, 100)
    prev_temp = np.clip(prev_temp, 34.0, 41.0)
    
    hr_change = hr - prev_hr
    spo2_change = spo2 - prev_spo2
    temp_change = temp - prev_temp
    
    hr_mavg = (hr + prev_hr) / 2
    spo2_mavg = (spo2 + prev_spo2) / 2
    temp_mavg = (temp + prev_temp) / 2
    
    hr_trend = hr_change / 5.0
    spo2_trend = spo2_change / 5.0
    temp_trend = temp_change / 5.0
    
    time_interval = np.random.uniform(2, 10, num_samples)
    
    # Calculate abnormal readings
    num_abnormal = np.zeros(num_samples)
    num_abnormal += (hr > 90) | (hr < 60)
    num_abnormal += (spo2 < 94)
    num_abnormal += (temp > 37.6) | (temp < 36.0)
    
    target = np.zeros(num_samples)
    for i in range(num_samples):
        score = 0
        if spo2[i] < 92 and spo2_change[i] < 0:
            score += 3
        if hr[i] > 105 and hr_change[i] > 5:
            score += 2
        if temp[i] > 38.5 and temp_change[i] > 0.3:
            score += 2
        if num_abnormal[i] >= 2 and (hr_change[i] > 2 or spo2_change[i] < -1):
            score += 2
            
        if score >= 3:
            target[i] = 1
            
    # X feature matrix
    X = np.column_stack((
        hr, spo2, temp,
        prev_hr, prev_spo2, prev_temp,
        hr_change, spo2_change, temp_change,
        hr_mavg, spo2_mavg, temp_mavg,
        hr_trend, spo2_trend, temp_trend,
        num_abnormal, time_interval
    ))
    
    return X, target

def train():
    print("[AI] Generating synthetic training data...")
    X, y = generate_synthetic_data()
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("[AI] Training Random Forest deterioration classifier...")
    clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    clf.fit(X_train, y_train)
    
    # Predictions
    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]
    
    # Metrics
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)
    
    print("=========================================")
    print("        MODEL EVALUATION METRICS         ")
    print("=========================================")
    print(f"Accuracy:  {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    print(f"F1-Score:  {f1:.4f}")
    print(f"ROC-AUC:   {auc:.4f}")
    print("=========================================")
    
    # Save model and metrics report
    os.makedirs("ai_model", exist_ok=True)
    joblib.dump(clf, "ai_model/model.pkl")
    print("[AI] Model serialized successfully to simulator/ai_model/model.pkl.")
    
    with open("ai_model/metrics.txt", "w") as f:
        f.write("VitalGuard AI Deterioration Model Report\n")
        f.write("----------------------------------------\n")
        f.write("Model Type: Random Forest Classifier\n")
        f.write("Dataset: Synthetic Patients Cohort (2000 samples)\n")
        f.write("Train/Test Split: 80/20\n\n")
        f.write(f"Accuracy:  {acc:.4f}\n")
        f.write(f"Precision: {prec:.4f}\n")
        f.write(f"Recall:    {rec:.4f}\n")
        f.write(f"F1-Score:  {f1:.4f}\n")
        f.write(f"ROC-AUC:   {auc:.4f}\n")
        
if __name__ == "__main__":
    train()
