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

// Rights issues (bedelli sermaye artırımı)
export interface RightsIssue {
  ticker: string;
  ex_date: string;
  /** New shares per existing share (1 = %100); null until the terms are entered. */
  ratio: number | null;
  subscription_price: number | null;
  price_factor: number;
  source: 'manual' | 'detected';
  needs_review: boolean;
  /** Shares the portfolio held at the close before the ex-date. */
  entitled_shares: number;
  rights: number | null;
}

export interface RightsIssueInput {
  ticker: string;
  ex_date: string;
  ratio: number;
  subscription_price: number;
}

export const getRightsIssues = async (portfolioId: number): Promise<RightsIssue[]> => {
  const response = await apiClient.get<RightsIssue[]>(`/portfolios/${portfolioId}/rights-issues`);
  return response.data;
};

export const saveRightsIssue = async (
  portfolioId: number,
  input: RightsIssueInput
): Promise<RightsIssue> => {
  const response = await apiClient.post<RightsIssue>(`/portfolios/${portfolioId}/rights-issues`, input);
  return response.data;
};

export const deleteRightsIssue = async (portfolioId: number, ticker: string, exDate: string) => {
  await apiClient.delete(
    `/portfolios/${portfolioId}/rights-issues/${encodeURIComponent(ticker)}/${exDate}`
  );
};

/** Stored price range of a TEFAS fund (prices come from uploaded Excel files). */
export interface FundPrices {
  ticker: string;
  first_date: string | null;
  last_date: string | null;
  days: number;
}

export const getFundPrices = async (portfolioId: number): Promise<FundPrices[]> => {
  const response = await apiClient.get<FundPrices[]>(`/portfolios/${portfolioId}/fund-prices`);
  return response.data;
};

export const uploadFundPrices = async (
  portfolioId: number,
  fundCode: string,
  file: File
): Promise<FundPrices> => {
  const body = new FormData();
  body.append('fund_code', fundCode);
  body.append('file', file);
  // Unset the JSON default so the browser adds the multipart boundary.
  const response = await apiClient.post<FundPrices>(`/portfolios/${portfolioId}/fund-prices`, body, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
};
