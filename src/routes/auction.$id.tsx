import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Crown, Loader2, PauseCircle, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getLocalLotBids, getLocalLotById, getLocalLots, placeBidOnLocalLot } from "@/lib/auction-catalog";
import { useCountdown } from "@/lib/auction-live";
import { formatClock, formatMoney, formatTime } from "@/lib/auction-types";
import { signIn, useSession } from "@/lib/session";
import lotImage from "@/assets/lot-watch.jpg";

export const Route = createFileRoute("/auction/$id")({
  head: () => ({
    meta: [
      { title: "Live Lot — Bid in Real Time | Saleroom" },
      {
        name: "description",
        content:
          "Follow the live auction clock and place quick bids. Winning and outbid status updates instantly for every bidder in the room.",
      },
      { property: "og:title", content: "Live Lot — Bid in Real Time" },
      {
        property: "og:description",
        content: "Live timer, quick bids and instant winning/outbid status for the open lot.",
      },
    ],
  }),
  component: AuctionPage,
});

function AuctionPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const [catalogLots, setCatalogLots] = useState(() => getLocalLots());
  const [submitting, setSubmitting] = useState<number | null>(null);
  const currentLot = getLocalLotById(id) ?? getLocalLots()[0] ?? null;
  const currentBids = currentLot ? getLocalLotBids(currentLot.id) : [];

  useEffect(() => {
    const syncLots = () => setCatalogLots(getLocalLots());
    window.addEventListener("saleroom-lots-changed", syncLots);
    window.addEventListener("storage", syncLots);

    return () => {
      window.removeEventListener("saleroom-lots-changed", syncLots);
      window.removeEventListener("storage", syncLots);
    };
  }, []);

  const ended = currentLot ? currentLot.status === "ENDED" : false;
  const paused = currentLot?.status === "PAUSED";
  const remaining = useCountdown(currentLot?.ends_at, paused);
  const timeUp = remaining <= 0;

  const liveBids = currentBids.filter((b) => !b.voided);
  const leader = liveBids[0];
  const isWinning = !!user && leader?.bidder_id === user.id;
  const wasOutbid = !!user && !isWinning && liveBids.some((b) => b.bidder_id === user.id);

  const bid = async (step: number) => {
    if (!currentLot || !user) return;
    setSubmitting(step);
    try {
      const nextLot = placeBidOnLocalLot({
        auctionId: currentLot.id,
        bidderId: user.id,
        bidderName: user.name,
        amount: Number(currentLot.current_price) + step,
      });
      if (!nextLot) throw new Error("Lot not found");
      setCatalogLots(getLocalLots());
      toast.success(`Bid placed at ${formatMoney(Number(nextLot.current_price))}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bid rejected");
    } finally {
      setSubmitting(null);
    }
  };

  if (!currentLot) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  const minNext = Number(currentLot.current_price) + Number(currentLot.min_increment);
  const quickBidSteps = [
    Number(currentLot.min_increment),
    Number(currentLot.min_increment) * 2,
    Number(currentLot.min_increment) * 3,
  ];
  const canBid = !!user && user.role === "BUYER" && !paused && !ended && !timeUp;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">
          ← Saleroom
        </Link>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="live-dot inline-block size-2 rounded-full bg-live" />
            Local catalog active
          </span>
          {user && (
            <span className="rounded-full border border-border px-3 py-1">
              {user.name} · {user.role}
            </span>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className="mt-6">
        {!user ? (
          <Banner tone="muted">
            <span>You are browsing as a guest.</span>
            <Button size="sm" onClick={() => signIn("BUYER")}>
              Sign in to bid
            </Button>
          </Banner>
        ) : paused ? (
          <Banner tone="muted">
            <PauseCircle className="size-4" /> Bidding is paused by the auctioneer.
          </Banner>
        ) : ended || timeUp ? (
          <Banner tone="muted">
            <Timer className="size-4" /> Lot closed —{" "}
            {leader ? `sold to ${leader.bidder_name} at ${formatMoney(leader.amount)}` : "no bids"}.
          </Banner>
        ) : isWinning ? (
          <Banner tone="winning">
            <Crown className="size-4" /> You are winning this lot at{" "}
            {formatMoney(Number(currentLot.current_price))}.
          </Banner>
        ) : wasOutbid ? (
          <Banner tone="outbid">
            <AlertTriangle className="size-4" /> You were outbid — {leader?.bidder_name} leads at{" "}
            {formatMoney(Number(currentLot.current_price))}.
          </Banner>
        ) : (
          <Banner tone="muted">Place a bid to join this lot.</Banner>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel overflow-hidden">
          <img
            src={currentLot.image_url ?? lotImage}
            alt={currentLot.title}
            width={1200}
            height={900}
            className="h-72 w-full object-cover"
          />
          <div className="space-y-4 p-7">
            <div>
              <p className="eyebrow text-primary">Lot 001 · {currentLot.status}</p>
              <h1 className="mt-2 text-3xl font-semibold">{currentLot.title}</h1>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{currentLot.description}</p>
            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
              <div>
                <dt className="eyebrow text-muted-foreground">Opening price</dt>
                <dd className="numeric mt-1">{formatMoney(Number(currentLot.starting_price))}</dd>
              </div>
              <div>
                <dt className="eyebrow text-muted-foreground">Min. increment</dt>
                <dd className="numeric mt-1">{formatMoney(Number(currentLot.min_increment))}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-border pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow text-muted-foreground">All current lots</p>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  {catalogLots.length} active
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {catalogLots.map((lot) => (
                  <Link
                    key={lot.id}
                    to="/auction/$id"
                    params={{ id: lot.id }}
                    className="rounded-xl border border-border bg-elevated/70 p-4 text-sm transition-colors hover:border-primary/60 hover:bg-primary/5"
                  >
                    <p className="font-medium">{lot.title}</p>
                    <p className="mt-1 text-muted-foreground">{lot.description}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="numeric text-primary">{formatMoney(lot.starting_price)}</span>
                      <span className="text-muted-foreground">{lot.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="panel p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-muted-foreground">Current bid</p>
                <p className="numeric mt-1 text-4xl font-semibold text-primary">
                  {formatMoney(Number(currentLot.current_price))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {leader ? `Leading: ${leader.bidder_name}` : "No bids yet"}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow text-muted-foreground">
                  {paused ? "Paused" : timeUp ? "Closed" : "Time left"}
                </p>
                <p
                  className={`numeric mt-1 text-4xl font-semibold ${
                    !paused && !timeUp && remaining < 30000 ? "text-live" : ""
                  }`}
                >
                  {formatClock(remaining)}
                </p>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-3 gap-3">
              {quickBidSteps.map((step) => (
                <Button
                  key={step}
                  size="lg"
                  disabled={!canBid || submitting !== null}
                  onClick={() => bid(step)}
                >
                  {submitting === step ? <Loader2 className="animate-spin" /> : `+$${step}`}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {user?.role === "ADMIN"
                ? "Admins cannot bid on lots they moderate."
                : `Next valid bid: ${formatMoney(minNext)}`}
            </p>
          </div>

          <div className="panel">
            <div className="border-b border-border px-6 py-4">
              <p className="eyebrow text-muted-foreground">Bid history</p>
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {currentBids.length === 0 && (
                <li className="px-6 py-6 text-sm text-muted-foreground">No bids yet.</li>
              )}
              {currentBids.map((b, i) => (
                <li
                  key={b.id}
                  className={`bid-enter flex items-center justify-between px-6 py-3 text-sm ${
                    b.voided ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {b.bidder_name}
                    {b.bidder_id === user?.id && (
                      <span className="eyebrow rounded bg-accent px-1.5 py-0.5">you</span>
                    )}
                    {i === 0 && !b.voided && <Crown className="size-3.5 text-primary" />}
                  </span>
                  <span className="numeric flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{formatTime(b.created_at)}</span>
                    {formatMoney(b.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "winning" | "outbid" | "muted";
  children: React.ReactNode;
}) {
  const tones = {
    winning: "bg-winning text-winning-foreground border-transparent",
    outbid: "bg-outbid text-outbid-foreground border-transparent",
    muted: "bg-elevated text-muted-foreground border-border",
  } as const;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-5 py-3 text-sm font-medium ${tones[tone]}`}
    >
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}
