import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Auction, AuctionStatus, Bid } from "./auction-types";

/**
 * Shared real-time state mechanism.
 *
 * Every window (buyer or admin) subscribes to the same Postgres change stream
 * for public.auctions + public.bids, so a bid placed in one browser window
 * appears in the admin window within a few hundred milliseconds.
 */

function normalizeAuction(row: Record<string, unknown>): Auction {
  return {
    ...(row as unknown as Auction),
    starting_price: Number(row.starting_price),
    current_price: Number(row.current_price),
    min_increment: Number(row.min_increment),
  };
}

function normalizeBid(row: Record<string, unknown>): Bid {
  return { ...(row as unknown as Bid), amount: Number(row.amount) };
}

export function useLiveAuction(auctionId: string) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("auctions").select("*").eq("id", auctionId).maybeSingle(),
      supabase
        .from("bids")
        .select("*")
        .eq("auction_id", auctionId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (!mounted.current) return;
    if (a.error || b.error) {
      setError(a.error?.message ?? b.error?.message ?? "Failed to load auction");
    } else {
      setError(a.data ? null : "Auction not found");
      setAuction(a.data ? normalizeAuction(a.data as Record<string, unknown>) : null);
      setBids(((b.data ?? []) as Record<string, unknown>[]).map(normalizeBid));
    }
    setLoading(false);
  }, [auctionId]);

  useEffect(() => {
    mounted.current = true;
    void refetch();

    const channel = supabase
      .channel(`auction-${auctionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `auction_id=eq.${auctionId}` },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auctions", filter: `id=eq.${auctionId}` },
        (payload) => {
          if (payload.new) setAuction(normalizeAuction(payload.new as Record<string, unknown>));
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      mounted.current = false;
      void supabase.removeChannel(channel);
    };
  }, [auctionId, refetch]);

  return { auction, bids, loading, error, connected, refetch };
}

/** Ticking countdown, recomputed every 250ms against the auction end time. */
export function useCountdown(endsAt: string | undefined, paused: boolean) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemaining(new Date(endsAt).getTime() - Date.now());
    tick();
    if (paused) return;
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt, paused]);

  return remaining;
}

/* ---------- mutations (Postgres functions keep bidding race-safe) ---------- */

export async function placeBid(input: {
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
}) {
  const { error } = await supabase.rpc("place_bid", {
    p_auction_id: input.auctionId,
    p_bidder_id: input.bidderId,
    p_bidder_name: input.bidderName,
    p_amount: input.amount,
  });
  if (error) throw new Error(error.message);
}

export async function voidBid(bidId: string) {
  const { error } = await supabase.rpc("void_bid", { p_bid_id: bidId });
  if (error) throw new Error(error.message);
}

export async function setAuctionStatus(auctionId: string, status: AuctionStatus) {
  const { error } = await supabase.rpc("set_auction_status", {
    p_auction_id: auctionId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function extendAuction(auctionId: string, seconds: number) {
  const { error } = await supabase.rpc("extend_auction", {
    p_auction_id: auctionId,
    p_seconds: seconds,
  });
  if (error) throw new Error(error.message);
}
