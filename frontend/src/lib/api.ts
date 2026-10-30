import axios from 'axios';
import { supabase } from './supabase';
import type { AnalysisResponse } from '@/components/analysis/types';

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token from Supabase
apiClient.interceptors.request.use(
  async (config) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

// ============================================
// API Functions
// ============================================

// Auth (email check only - actual auth handled by Supabase client)
export const checkEmailExists = async (email: string): Promise<{ exists: boolean }> => {
  const response = await apiClient.post('/auth/check-email', { email });
  return response.data;
};

export const getMe = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data;
};

// Analysis (portfolio/transaction CRUD goes straight to Supabase, see services/portfolioService.ts)
export const analyzePortfolio = async (portfolioId: number): Promise<AnalysisResponse> => {
  const response = await apiClient.get<AnalysisResponse>(`/portfolios/${portfolioId}/analyze`);
  return response.data;
};
