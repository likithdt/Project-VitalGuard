import React, { createContext, useState, useEffect, useContext } from 'react';
import API from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  const syncUserStorage = (userData) => {
    if (!userData) return;
    if (userData.role) localStorage.setItem('userRole', userData.role);
    if (userData.id != null) localStorage.setItem('userId', userData.id.toString());
    if (userData.hospitalId != null) localStorage.setItem('hospitalId', userData.hospitalId.toString());
    if (userData.doctorId != null) {
      localStorage.setItem('doctorId', userData.doctorId.toString());
    } else if (userData.role === 'DOCTOR' && userData.id != null) {
      localStorage.setItem('doctorId', userData.id.toString());
    }
    if (userData.ambulanceId != null) localStorage.setItem('ambulanceId', userData.ambulanceId.toString());
  };

  const clearUserStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('hospitalId');
    localStorage.removeItem('doctorId');
    localStorage.removeItem('ambulanceId');
  };

  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const res = await API.get('/auth/profile');
          syncUserStorage(res.data);
          setUser(res.data);
        } catch (error) {
          console.error('Failed to load profile:', error);
          logout();
        }
      }
      setLoading(false);
    };
    loadUser();
  }, [token]);

  const login = async (email, password) => {
    const res = await API.post('/auth/login', { email, password });
    const { token: jwtToken, ...userData } = res.data;
    localStorage.setItem('token', jwtToken);
    syncUserStorage(userData);
    setToken(jwtToken);
    setUser(userData);
    return userData;
  };

  const register = async (formData) => {
    const res = await API.post('/auth/register', formData);
    const { token: jwtToken, ...userData } = res.data;
    localStorage.setItem('token', jwtToken);
    syncUserStorage(userData);
    setToken(jwtToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    clearUserStorage();
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const res = await API.put('/auth/profile', updates);
    // Reload profile
    const profileRes = await API.get('/auth/profile');
    setUser(profileRes.data);
    return profileRes.data;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
