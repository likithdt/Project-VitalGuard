package com.vitaguard.patient_app.core.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vitaguard.patient_app.core.network.ApiClient
import com.vitaguard.patient_app.core.network.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class LoginState {
    object Idle : LoginState()
    object Loading : LoginState()
    data class Success(val role: String) : LoginState()
    data class Error(val message: String) : LoginState()
}

class LoginViewModel : ViewModel() {
    private val _loginState = MutableStateFlow<LoginState>(LoginState.Idle)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _loginState.value = LoginState.Loading
            try {
                // In a real scenario, use repository pattern.
                // For direct implementation:
                val response = ApiClient.apiService.login(LoginRequest(email, password))
                _loginState.value = LoginState.Success(response.role)
            } catch (e: Exception) {
                _loginState.value = LoginState.Error(e.message ?: "Login failed")
            }
        }
    }
}
