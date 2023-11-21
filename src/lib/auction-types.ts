/**
 * Shared domain types for the live auction prototype.
 * These mirror the database schema (public.auctions / public.bids).
 */

export type Role = "BUYER" | "ADMIN";

export type AuctionStatus = "LIVE" | "PAUSED" | "ENDED";

export interface SessionUser {
  /** Simulated user id — stable per browser window/profile. */
  id: string;
  name: string;
  role: Role;
}

export interface Auction {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  starting_price: number;
  current_price: number;
  min_increment: number;
  ends_at: string;
  status: AuctionStatus;
  anti_snipe_window_seconds: number;
  anti_snipe_extend_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  voided: boolean;
  created_at: string;
}

export const DEMO_AUCTION_ID = "11111111-1111-4111-8111-111111111111";

export const QUICK_BID_STEPS = [10, 50, 100] as const;

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatClock(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
