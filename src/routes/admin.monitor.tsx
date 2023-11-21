import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Ban, Loader2, Pause, Play, Plus, ShieldCheck, PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatClock, formatMoney, formatTime } from "@/lib/auction-types";
import {
  createLocalLot,
  extendLocalLot,
  getLocalLotBids,
  getLocalLots,
  setLocalLotStatus,
  voidLocalBid,
} from "@/lib/auction-catalog";
import { useCountdown } from "@/lib/auction-live";
import { signOut, useSession } from "@/lib/session";

export const Route = createFileRoute("/admin/monitor")({
  head: () => ({
    meta: [
      { title: "Auction Control Room — Admin Monitor | Saleroom" },
      {
        name: "description",
        content:
          "Admin-only monitor: live bid ticker, pause the sale, void bids and extend the clock against snipers.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Auction Control Room" },
      { property: "og:description", content: "Real-time bid ticker and auction controls." },
    ],
  }),
  component: AdminMonitor,
});

function AdminMonitor() {
  const { user } = useSession();
  const [selectedLotId, setSelectedLotId] = useState<string | null>(() => getLocalLots()[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingPrice, setStartingPrice] = useState("5000");
  const [minIncrement, setMinIncrement] = useState("250");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lots, setLots] = useState(() => getLocalLots());

  useEffect(() => {
    const syncLots = () => {
      const nextLots = getLocalLots();
      setLots(nextLots);
      if (!selectedLotId || !nextLots.some((lot) => lot.id === selectedLotId)) {
        setSelectedLotId(nextLots[0]?.id ?? null);
      }
    };

    syncLots();
    window.addEventListener("saleroom-lots-changed", syncLots);
    window.addEventListener("storage", syncLots);

    return () => {
      window.removeEventListener("saleroom-lots-changed", syncLots);
      window.removeEventListener("storage", syncLots);
    };
  }, [selectedLotId]);

  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? lots[0] ?? null;
  const selectedBids = selectedLot ? getLocalLotBids(selectedLot.id) : [];
  const paused = selectedLot?.status === "PAUSED";
  const remaining = useCountdown(selectedLot?.ends_at, paused);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      const nextLots = getLocalLots();
      setLots(nextLots);
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextImageUrl = typeof reader.result === "string" ? reader.result : null;
      setImageUrl(nextImageUrl);
    };
    reader.readAsDataURL(file);
  };

  const addLot = () => {
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    const nextStartingPrice = Number(startingPrice);
    const nextMinIncrement = Number(minIncrement);

    if (!nextTitle || !nextDescription || Number.isNaN(nextStartingPrice) || Number.isNaN(nextMinIncrement)) {
      toast.error("Please complete every field before adding a lot.");
      return;
    }

    const nextLots = createLocalLot({
      title: nextTitle,
      description: nextDescription,
      startingPrice: nextStartingPrice,
      minIncrement: nextMinIncrement,
      imageUrl,
    });

    setLots(nextLots);
    setSelectedLotId(nextLots[nextLots.length - 1]?.id ?? null);
    setTitle("");
    setDescription("");
    setStartingPrice("5000");
    setMinIncrement("250");
    setImageUrl(null);
    toast.success("Lot added to the saleroom");
  };

  if (!selectedLot) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  const liveBids = selectedBids.filter((b) => !b.voided);
  const uniqueBidders = new Set(liveBids.map((b) => b.bidder_id)).size;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2 text-primary">
            <ShieldCheck className="size-3.5" /> Admin control room
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{selectedLot.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="live-dot inline-block size-2 rounded-full bg-live" />
            Local catalog active
          </span>
          <Link to="/auction/$id" params={{ id: selectedLot.id }} className="hover:text-foreground">
            Buyer view
          </Link>
          <span className="rounded-full border border-border px-3 py-1">{user?.name}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Status" value={selectedLot.status} accent={paused ? "live" : "primary"} />
        <Stat label="Current price" value={formatMoney(Number(selectedLot.current_price))} accent="primary" />
        <Stat label="Time left" value={formatClock(remaining)} accent={remaining < 30000 ? "live" : "default"} />
        <Stat label="Bidders / bids" value={`${uniqueBidders} / ${liveBids.length}`} accent="default" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="panel space-y-5 p-7">
          <p className="eyebrow text-muted-foreground">Controls</p>

          <Button
            className="w-full"
            variant={paused ? "default" : "outline"}
            disabled={busy !== null}
            onClick={() =>
              run(
                "pause",
                async () => {
                  setLocalLotStatus(selectedLot.id, paused ? "LIVE" : "PAUSED");
                },
                paused ? "Auction resumed" : "Auction paused",
              )
            }
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume auction" : "Pause auction"}
          </Button>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="eyebrow text-muted-foreground">Anti-sniping clock extender</p>
            <p className="text-xs text-muted-foreground">Add more time manually here.</p>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 300].map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`ext-${s}`, async () => {
                      extendLocalLot(selectedLot.id, s);
                    }, `Clock extended by ${s}s`)
                  }
                >
                  <Plus /> {s >= 60 ? `${s / 60}m` : `${s}s`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="eyebrow text-muted-foreground">Close lot</p>
            <Button
              variant="destructive"
              className="w-full"
              disabled={busy !== null || selectedLot.status === "ENDED"}
              onClick={() =>
                run("end", async () => {
                  setLocalLotStatus(selectedLot.id, "ENDED");
                }, "Lot closed")
              }
            >
              End auction now
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="eyebrow text-muted-foreground">Add more products</p>
            <p className="text-xs text-muted-foreground">
              Create additional lots from this same admin workspace so they appear in the saleroom immediately.
            </p>
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lot name" />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short product description"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min="0"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  placeholder="Starting price"
                />
                <Input
                  type="number"
                  min="0"
                  value={minIncrement}
                  onChange={(e) => setMinIncrement(e.target.value)}
                  placeholder="Min increment"
                />
              </div>
              <div className="space-y-2">
                <Input type="file" accept="image/*" onChange={handleImageSelection} />
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Selected lot preview"
                    className="h-32 w-full rounded-lg border border-border object-cover"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Optional: attach a product photo for this lot.</p>
                )}
              </div>
              <Button className="w-full" onClick={addLot}>
                <PackagePlus /> Add lot
              </Button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <p className="eyebrow text-muted-foreground">Live bid ticker</p>
            <span className="numeric text-xs text-muted-foreground">{selectedBids.length} events</span>
          </div>
          <div className="border-b border-border px-6 py-4 text-sm">
            <p className="text-muted-foreground">Catalog</p>
            <p className="mt-1 font-medium">{lots.length} lots available for the saleroom</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lots.map((lot) => (
                <button
                  key={lot.id}
                  type="button"
                  onClick={() => setSelectedLotId(lot.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedLot.id === lot.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {lot.title}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-130 divide-y divide-border overflow-y-auto">
            {selectedBids.length === 0 && (
              <li className="px-6 py-8 text-sm text-muted-foreground">Waiting for the first bid…</li>
            )}
            {selectedBids.map((b) => (
              <li
                key={b.id}
                className={`bid-enter flex items-center justify-between gap-4 px-6 py-3 text-sm ${
                  b.voided ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className={`font-medium ${b.voided ? "line-through" : ""}`}>{b.bidder_name}</p>
                  <p className="numeric truncate text-xs text-muted-foreground">
                    {formatTime(b.created_at)} · {b.bidder_id}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`numeric font-semibold ${b.voided ? "line-through" : ""}`}>
                    {formatMoney(b.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={b.voided || busy !== null}
                    onClick={() =>
                      run(`void-${b.id}`, async () => {
                        voidLocalBid(b.id);
                      }, "Bid voided and price rolled back")
                    }
                  >
                    <Ban /> {b.voided ? "Voided" : "Void"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "primary" | "live" | "default";
}) {
  const tone =
    accent === "primary" ? "text-primary" : accent === "live" ? "text-live" : "text-foreground";
  return (
    <div className="panel p-5">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={`numeric mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
