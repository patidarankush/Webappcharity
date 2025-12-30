import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are not set. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Diary {
  id: string;
  diary_number: number;
  ticket_start_range: number;
  ticket_end_range: number;
  total_tickets: number;
  expected_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Issuer {
  id: string;
  issuer_name: string;
  contact_number: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface DiaryAllotment {
  id: string;
  diary_id: string;
  issuer_id: string;
  allotment_date: string;
  status: 'allotted' | 'fully_sold' | 'paid' | 'returned';
  amount_collected: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  diary?: Diary;
  issuer?: Issuer;
}

export interface TicketSale {
  id: string;
  lottery_number: number;
  purchaser_name: string;
  purchaser_contact: string;
  purchaser_address?: string;
  issuer_id: string;
  diary_id: string;
  purchase_date: string;
  amount_paid: number;
  created_at: string;
  updated_at: string;
  // Joined data
  issuer?: Issuer;
  diary?: Diary;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values?: any;
  new_values?: any;
  user_id?: string;
  timestamp: string;
}

export interface DashboardStats {
  total_tickets_sold: number;
  total_revenue: number;
  diaries_allotted: number;
  diaries_fully_sold: number;
  diaries_paid: number;
  diaries_returned: number;
  diaries_remaining: number;
  total_amount_collected: number;
  expected_amount_from_allotted: number;
}

export interface IssuerPerformance {
  id: string;
  issuer_name: string;
  contact_number: string;
  diaries_allotted: number;
  diaries_paid: number;
  tickets_sold: number;
  total_collected: number;
  expected_amount: number;
  collection_percentage: number;
}

export interface LotteryWinner {
  id: string;
  lottery_number: number;
  ticket_sale_id?: string;
  prize_category: string;
  prize_quantity: number;
  winner_name: string;
  winner_contact: string;
  winner_address?: string;
  diary_number?: number;
  registered_at: string;
  registered_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  ticket?: TicketSale;
}

export interface PrizeCategory {
  id: string;
  category_name: string;
  total_quantity: number;
  created_at: string;
}

// Prize categories with quantities
export const PRIZE_CATEGORIES = [
  { name: 'THAR CAR', quantity: 1 },
  { name: 'SWIFT CAR', quantity: 1 },
  { name: 'E-Rickshaw', quantity: 1 },
  { name: 'Bullet Bike', quantity: 1 },
  { name: 'HF delux Bike', quantity: 5 },
  { name: 'Electric Bike', quantity: 3 },
  { name: 'AC 1Ton', quantity: 1 },
  { name: 'Laptop', quantity: 3 },
  { name: '32 Inch LED TV', quantity: 5 },
  { name: 'Fridge', quantity: 5 },
  { name: 'Washing Machine', quantity: 5 },
  { name: 'Sewing Machine', quantity: 5 },
  { name: 'Sports Cycle', quantity: 5 },
  { name: '5G Mobile', quantity: 11 },
  { name: 'Cooler', quantity: 11 },
  { name: 'Child EV Bike', quantity: 10 },
  { name: 'Home Theater', quantity: 5 },
  { name: 'Electric Water Heater', quantity: 5 },
  { name: 'Battery Spray Pump', quantity: 27 },
  { name: 'Mixer', quantity: 10 },
  { name: 'Induction stove', quantity: 10 },
  { name: 'Ceiling Fan', quantity: 10 },
  { name: 'Smart Watch', quantity: 11 },
  { name: 'Gas Stove', quantity: 27 },
  { name: 'Helmet', quantity: 54 },
  { name: 'Silver Coin', quantity: 54 },
  { name: 'Wall Clock', quantity: 108 },
  { name: 'Photo Frame', quantity: 108 }
] as const;

// Helper function to get diary number from lottery number
export function getDiaryFromLotteryNumber(lotteryNumber: number): number {
  if (lotteryNumber <= 39996) {
    return Math.ceil(lotteryNumber / 22);
  } else {
    return 1819; // Last diary
  }
}

// Helper function to get ticket range for a diary
export function getTicketRangeForDiary(diaryNumber: number): { start: number; end: number } {
  if (diaryNumber === 1819) {
    return { start: 39997, end: 39999 };
  } else {
    const start = (diaryNumber - 1) * 22 + 1;
    const end = diaryNumber * 22;
    return { start, end };
  }
}

// Helper function to validate lottery number for diary
export function validateLotteryNumberForDiary(lotteryNumber: number, diaryNumber: number): boolean {
  const range = getTicketRangeForDiary(diaryNumber);
  return lotteryNumber >= range.start && lotteryNumber <= range.end;
}

// Helper function to format lottery number as 5-digit string
export function formatLotteryNumber(lotteryNumber: number): string {
  return lotteryNumber.toString().padStart(5, '0');
}

// Helper function to parse 5-digit lottery number string to number
export function parseLotteryNumber(lotteryNumberString: string): number {
  return parseInt(lotteryNumberString, 10);
}

// Helper function to get formatted ticket range for a diary
export function getFormattedTicketRangeForDiary(diaryNumber: number): { start: string; end: string } {
  const range = getTicketRangeForDiary(diaryNumber);
  return {
    start: formatLotteryNumber(range.start),
    end: formatLotteryNumber(range.end)
  };
}
