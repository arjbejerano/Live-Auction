import type { Auction, AuctionStatus, Bid } from "./auction-types";

export interface AuctionLot extends Auction {
  source?: "LOCAL";
}

interface CreateLocalLotInput {
  title: string;
  description: string;
  startingPrice: number;
  minIncrement: number;
  imageUrl?: string | null;
}

interface LocalLotStateEntry {
  bids: Bid[];
}

const CATALOG_KEY = "saleroom-lots-v1";
const STATE_KEY = "saleroom-lot-state-v1";

function buildDefaultLot(): AuctionLot {
  const now = new Date().toISOString();
  return {
    id: "local-lot-001",
    title: "Patek Philippe Nautilus 5711",
    description:
      "A steel sports watch with a blue dial and polished bracelet — the featured lot in the current saleroom prototype.",
    image_url: null,
    starting_price: 280000,
    current_price: 280000,
    min_increment: 2500,
    ends_at: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    status: "LIVE" as AuctionStatus,
    anti_snipe_window_seconds: 30,
    anti_snipe_extend_seconds: 15,
    created_at: now,
    updated_at: now,
    source: "LOCAL",
  };
}

function emitLotsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("saleroom-lots-changed"));
  }
}

function readStoredLots(): AuctionLot[] {
  if (typeof window === "undefined") return [buildDefaultLot()];

  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    if (!raw) {
      const seeded = [buildDefaultLot()];
      window.localStorage.setItem(CATALOG_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw) as AuctionLot[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = [buildDefaultLot()];
      window.localStorage.setItem(CATALOG_KEY, JSON.stringify(seeded));
      return seeded;
    }

    return parsed;
  } catch {
    return [buildDefaultLot()];
  }
}

function readStoredStates(): Record<string, LocalLotStateEntry> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalLotStateEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistCatalog(lots: AuctionLot[], states: Record<string, LocalLotStateEntry>) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CATALOG_KEY, JSON.stringify(lots));
  window.localStorage.setItem(STATE_KEY, JSON.stringify(states));
  emitLotsChanged();
}

function ensureLotState(lotId: string, states: Record<string, LocalLotStateEntry>) {
  if (!states[lotId]) {
    states[lotId] = { bids: [] };
  }
  return states[lotId];
}

export function getLocalLots(): AuctionLot[] {
  return readStoredLots();
}

export function getLocalLotById(id: string): AuctionLot | null {
  return getLocalLots().find((lot) => lot.id === id) ?? null;
}

export function getLocalLotBids(id: string): Bid[] {
  const states = readStoredStates();
  return states[id]?.bids ?? [];
}

export function createLocalLot(input: CreateLocalLotInput): AuctionLot[] {
  const nextLot: AuctionLot = {
    ...buildDefaultLot(),
    id: `local-lot-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    image_url: input.imageUrl ?? null,
    starting_price: input.startingPrice,
    current_price: input.startingPrice,
    min_increment: input.minIncrement,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: "LOCAL",
  };

  const nextLots = [...getLocalLots(), nextLot];
  const states = readStoredStates();
  ensureLotState(nextLot.id, states);

  persistCatalog(nextLots, states);
  return nextLots;
}

export function updateLocalLot(id: string, updater: (lot: AuctionLot) => AuctionLot): AuctionLot | null {
  const lots = readStoredLots();
  const index = lots.findIndex((lot) => lot.id === id);
  if (index < 0) return null;

  const nextLot = updater({ ...lots[index] });
  lots[index] = nextLot;
  const states = readStoredStates();
  ensureLotState(id, states);
  persistCatalog(lots, states);
  return nextLot;
}

export function setLocalLotStatus(id: string, status: AuctionStatus): AuctionLot | null {
  return updateLocalLot(id, (lot) => ({ ...lot, status, updated_at: new Date().toISOString() }));
}

export function extendLocalLot(id: string, seconds: number): AuctionLot | null {
  return updateLocalLot(id, (lot) => ({
    ...lot,
    ends_at: new Date(new Date(lot.ends_at).getTime() + seconds * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export function placeBidOnLocalLot(input: {
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
}): AuctionLot | null {
  const states = readStoredStates();
  const state = ensureLotState(input.auctionId, states);
  const lot = getLocalLotById(input.auctionId);
  if (!lot) return null;

  const nextAmount = Math.max(input.amount, Number(lot.current_price) + Number(lot.min_increment));
  const nextBid: Bid = {
    id: `local-bid-${Date.now()}`,
    auction_id: input.auctionId,
    bidder_id: input.bidderId,
    bidder_name: input.bidderName,
    amount: nextAmount,
    voided: false,
    created_at: new Date().toISOString(),
  };

  state.bids = [nextBid, ...state.bids].slice(0, 100);
  const nextLot = {
    ...lot,
    current_price: nextAmount,
    updated_at: new Date().toISOString(),
  };

  const lots = readStoredLots();
  const index = lots.findIndex((existing) => existing.id === input.auctionId);
  if (index >= 0) {
    lots[index] = nextLot;
  }

  persistCatalog(lots, states);
  return nextLot;
}

export function voidLocalBid(bidId: string): AuctionLot | null {
  const states = readStoredStates();
  let matchedLotId: string | null = null;

  for (const [lotId, state] of Object.entries(states)) {
    const match = state.bids.find((bid) => bid.id === bidId);
    if (match) {
      matchedLotId = lotId;
      break;
    }
  }

  if (!matchedLotId) return null;

  const state = ensureLotState(matchedLotId, states);
  const lot = getLocalLotById(matchedLotId);
  if (!lot) return null;

  state.bids = state.bids.map((bid) => (bid.id === bidId ? { ...bid, voided: true } : bid));
  const highestNonVoided = [...state.bids]
    .filter((bid) => !bid.voided)
    .sort((a, b) => b.amount - a.amount)[0];

  const nextLot = {
    ...lot,
    current_price: highestNonVoided?.amount ?? lot.starting_price,
    updated_at: new Date().toISOString(),
  };

  const lots = readStoredLots();
  const index = lots.findIndex((existing) => existing.id === matchedLotId);
  if (index >= 0) {
    lots[index] = nextLot;
  }

  persistCatalog(lots, states);
  return nextLot;
}
