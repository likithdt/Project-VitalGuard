package com.vitaguard.backend_java.medical;

import com.vitaguard.backend_java.user.Vital;
import java.util.List;

public interface RiskAnalysisService {
    RiskResult analyzeRisk(Vital current, List<Vital> history);
}
