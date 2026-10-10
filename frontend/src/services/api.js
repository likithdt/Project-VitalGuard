import axios from 'axios';
import { useEffect, useState } from 'react';

const API = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle unauthorized errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const displayValue = (value, suffix = '') => {
  if (value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item => displayValue(item)).join(', ') || 'Not recorded';
  if (typeof value === 'object') return 'Not recorded';
  return `${value}${suffix}`;
};

export const displayDate = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
};

export const isActiveEmergency = emergency => !emergency.cancelled && !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(emergency.status?.toUpperCase());

export function useApiResource(path, revision = 0) {
  const [state, setState] = useState({ path: null, data: null, loading: false, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState(previous => ({ path, data: previous.path === path ? previous.data : null, loading: true, error: '' }));
    API.get(path, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setState({ path, data: response.status === 204 ? null : response.data, loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ path, data: null, loading: false, error: error.response?.status === 403 ? 'Access denied.' : error.response?.status === 404 ? 'Record not found.' : 'Unable to load data. Please retry.' });
    });
    return () => controller.abort();
  }, [path, revision, retry]);
  return { ...(state.path === path && path ? state : { data: null, loading: Boolean(path), error: '' }), refresh: () => setRetry(value => value + 1) };
}

export default API;
