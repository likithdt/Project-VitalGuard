import pandas as pd
import matplotlib.pyplot as plt
import joblib

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    ConfusionMatrixDisplay,
    classification_report
)

# ==========================
# Load Dataset
# ==========================

df = pd.read_csv("Health_Monitoring_Dataset.csv")

X = df[["Heart_Rate", "SpO2", "Temperature", "Pressure"]]
y = df["Health_Status"]

# Encode Labels
encoder = LabelEncoder()
y = encoder.fit_transform(y)

# ==========================
# Train/Test Split
# ==========================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# ==========================
# Train Model
# ==========================

model = RandomForestClassifier(
    n_estimators=200,
    random_state=42
)

model.fit(X_train, y_train)

# ==========================
# Predictions
# ==========================

y_pred = model.predict(X_test)

# ==========================
# Metrics
# ==========================

accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred)
recall = recall_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)

print("\nAccuracy :", accuracy)
print("Precision:", precision)
print("Recall   :", recall)
print("F1 Score :", f1)

print("\nClassification Report\n")
print(classification_report(
    y_test,
    y_pred,
    target_names=encoder.classes_
))

# ==========================
# Save Model
# ==========================

joblib.dump(model, "health_model.pkl")
joblib.dump(encoder, "label_encoder.pkl")

print("\nModel Saved Successfully!")

# ===================================================
# GRAPH 1 : Accuracy Metrics
# ===================================================

metrics = ["Accuracy", "Precision", "Recall", "F1 Score"]
values = [accuracy, precision, recall, f1]

plt.figure(figsize=(7,5))
plt.bar(metrics, values)
plt.ylim(0,1.05)
plt.ylabel("Score")
plt.title("Performance Metrics")
plt.savefig("accuracy_metrics.png", dpi=300)
plt.show()

# ===================================================
# GRAPH 2 : Confusion Matrix
# ===================================================

cm = confusion_matrix(y_test, y_pred)

disp = ConfusionMatrixDisplay(
    confusion_matrix=cm,
    display_labels=encoder.classes_
)

disp.plot(cmap="Blues")
plt.title("Confusion Matrix")
plt.savefig("confusion_matrix.png", dpi=300)
plt.show()

# ===================================================
# GRAPH 3 : Feature Importance
# ===================================================

importance = model.feature_importances_

plt.figure(figsize=(7,5))
plt.bar(X.columns, importance)
plt.ylabel("Importance")
plt.title("Feature Importance")
plt.savefig("feature_importance.png", dpi=300)
plt.show()

print("\nGraphs Saved Successfully!")