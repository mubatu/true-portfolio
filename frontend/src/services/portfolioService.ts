import { supabase } from '@/lib/supabase';
import { apiClient } from '@/lib/api';
import { type Market, toFullTicker } from '@/config';
export { analyzePortfolio } from '@/lib/api';

export interface Portfolio {
  id: number;
  user_id: string;
  name: string;
  market: Market;
  slug: string;
  created_at: string;
  transaction_count?: number;
}

export interface Transaction {
  id: number;
  portfolio_id: number;
  ticker: string;
  operation: 'buy' | 'sell';
  quantity: number;
  adjusted_quantity?: number | null;
  price: number;
  adjusted_price?: number | null;
  date: string;
  created_at: string;
}

export interface CreatePortfolioInput {
  name: string;
  market: Market;
}

export interface UpdatePortfolioInput {
  id: number;
  name: string;
}

export interface CreateTransactionInput {
  portfolio_id: number;
  ticker: string;
  operation: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: string;
}

export interface UpdateTransactionInput {
  id: number;
  ticker: string;
  operation: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: string;
}

// Portfolio CRUD operations
export async function getPortfolios(): Promise<Portfolio[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get portfolios with transaction count
  const { data: portfolios, error } = await supabase
    .from('portfolios')
    .select(`
      *,
      transactions:transactions(count)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  // Transform the data to include transaction_count
  type PortfolioRow = Portfolio & { transactions?: { count: number }[] };
  return ((portfolios || []) as PortfolioRow[]).map((p) => ({
    ...p,
    transaction_count: p.transactions?.[0]?.count || 0,
  }));
}

export async function getPortfolio(id: number): Promise<Portfolio | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(error.message);
  }

  return data;
}

export async function getPortfolioBySlug(slug: string): Promise<Portfolio | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(error.message);
  }

  return data;
}

export async function createPortfolio(input: CreatePortfolioInput): Promise<Portfolio> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({
      name: input.name,
      market: input.market,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePortfolio(id: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePortfolio(input: UpdatePortfolioInput): Promise<Portfolio> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('portfolios')
    .update({
      name: input.name,
    })
    .eq('id', input.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePortfolioBySlug(slug: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('slug', slug)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }
}

// Transaction CRUD operations
export async function getTransactions(portfolioId: number): Promise<Transaction[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // First verify the portfolio belongs to the user
  const portfolio = await getPortfolio(portfolioId);
  if (!portfolio) {
    throw new Error('Portfolio not found');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getTransactionsBySlug(slug: string): Promise<Transaction[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // First verify the portfolio belongs to the user and get its id
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) {
    throw new Error('Portfolio not found');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function getAdjustedValues(
  portfolioId: number,
  ticker: string,
  quantity: number,
  price: number,
  txnDate: string
): Promise<{ adjustedQuantity: number; adjustedPrice: number }> {
  try {
    const response = await apiClient.get(`/portfolios/${portfolioId}/adjusted-price`, {
      params: {
        ticker,
        quantity,
        price,
        date: txnDate,
      },
    });

    const adjustedQuantity = Number(response.data?.adjusted_quantity);
    const adjustedPrice = Number(response.data?.adjusted_price);
    return {
      adjustedQuantity: Number.isFinite(adjustedQuantity)
        ? adjustedQuantity
        : quantity,
      adjustedPrice: Number.isFinite(adjustedPrice) ? adjustedPrice : price,
    };
  } catch {
    // Fallback to raw values if API is unavailable; analyze flow refreshes later.
    return {
      adjustedQuantity: quantity,
      adjustedPrice: price,
    };
  }
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // First verify the portfolio belongs to the user
  const portfolio = await getPortfolio(input.portfolio_id);
  if (!portfolio) {
    throw new Error('Portfolio not found');
  }
  const portfolioMarket = portfolio.market || 'BIST';
  const fullTicker = toFullTicker(input.ticker.toUpperCase(), portfolioMarket);
  const adjusted = await getAdjustedValues(
    input.portfolio_id,
    fullTicker,
    input.quantity,
    input.price,
    input.date
  );

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      portfolio_id: input.portfolio_id,
      ticker: fullTicker,
      operation: input.operation,
      quantity: input.quantity,
      adjusted_quantity: adjusted.adjustedQuantity,
      price: input.price,
      adjusted_price: adjusted.adjustedPrice,
      date: input.date,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get the transaction to verify ownership through portfolio
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('portfolio_id')
    .eq('id', id)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  // Verify the portfolio belongs to the user
  const portfolio = await getPortfolio(transaction.portfolio_id);
  if (!portfolio) {
    throw new Error('Transaction not found');
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateTransaction(input: UpdateTransactionInput): Promise<Transaction> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get the transaction to verify ownership through portfolio
  const { data: existingTransaction, error: fetchError } = await supabase
    .from('transactions')
    .select('portfolio_id')
    .eq('id', input.id)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  // Verify the portfolio belongs to the user
  const portfolio = await getPortfolio(existingTransaction.portfolio_id);
  if (!portfolio) {
    throw new Error('Transaction not found');
  }
  const portfolioMarket = portfolio.market || 'BIST';
  const fullTicker = toFullTicker(input.ticker.toUpperCase(), portfolioMarket);
  const adjusted = await getAdjustedValues(
    existingTransaction.portfolio_id,
    fullTicker,
    input.quantity,
    input.price,
    input.date
  );

  const { data, error } = await supabase
    .from('transactions')
    .update({
      ticker: fullTicker,
      operation: input.operation,
      quantity: input.quantity,
      adjusted_quantity: adjusted.adjustedQuantity,
      price: input.price,
      adjusted_price: adjusted.adjustedPrice,
      date: input.date,
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
