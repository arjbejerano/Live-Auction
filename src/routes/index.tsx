import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Gavel, ShieldCheck, Radio, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_AUCTION_ID } from "@/lib/auction-types";
import { getLocalLots } from "@/lib/auction-catalog";
import { signIn, signOut, useSession } from "@/lib/session";
import lotImage from "@/assets/lot-watch.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saleroom — Live Auction Prototype with Buyer & Admin Views" },
      {
        name: "description",
        content:
          "A real-time auction prototype: bid as a buyer in one window and watch bids stream into the admin monitor instantly.",
      },
      { property: "og:title", content: "Saleroom — Live Auction Prototype" },
      {
        property: "og:description",
        content:
          "Real-time bidding with quick-bid buttons, winning/outbid banners, and an admin control room with void, pause and anti-sniping tools.",
      },
    ],
  }),
  component: Lobby,
});

function Lobby() {
  const { user, ready } = useSession();
  const [name, setName] = useState("");
  const [lots, setLots] = useState(() => getLocalLots());
  const navigate = useNavigate();

  useEffect(() => {
    const syncLots = () => setLots(getLocalLots());
    window.addEventListener("saleroom-lots-changed", syncLots);
    window.addEventListener("storage", syncLots);

    return () => {
      window.removeEventListener("saleroom-lots-changed", syncLots);
      window.removeEventListener("storage", syncLots);
    };
  }, []);

  const enter = (role: "BUYER" | "ADMIN") => {
    signIn(role, name);
    const buyerLotId = getLocalLots()[0]?.id ?? DEMO_AUCTION_ID;
    navigate({
      to: role === "ADMIN" ? "/admin/monitor" : "/auction/$id",
      params: role === "ADMIN" ? undefined : { id: buyerLotId },
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-12 px-6 py-16">
      <header className="max-w-2xl">
        <p className="eyebrow text-primary">Live auction prototype</p>
        <h1 className="mt-4 text-5xl font-semibold leading-[1.05] md:text-6xl">
          Two windows.
          <br />
          One live saleroom.
        </h1>
        <p className="mt-5 text-base text-muted-foreground">
          Sign in as a buyer in one browser window and as an admin in another. Every bid, pause and
          void is broadcast over the shared realtime channel — no refresh anywhere.
        </p>
        {ready && user && (
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              Currently signed in as{" "}
              <span className="text-foreground">
                {user.name} ({user.role})
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        )}
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="panel overflow-hidden">
          <img
            src={lotImage}
            alt="Steel sports wristwatch with blue dial, the featured auction lot"
            width={1200}
            height={900}
            className="h-56 w-full object-cover"
          />
          <div className="space-y-5 p-7">
            <div>
              <p className="eyebrow text-muted-foreground">Current saleroom · {lots.length} lots</p>
              <h2 className="mt-2 text-2xl font-semibold">Browse and add more lots</h2>
            </div>

            <div className="space-y-3">
              <label htmlFor="display-name" className="eyebrow block text-muted-foreground">
                Display name (optional)
              </label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marcus V."
                className="bg-elevated"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" onClick={() => enter("BUYER")}>
                <Gavel /> Enter as Buyer
              </Button>
              <Button size="lg" variant="outline" onClick={() => enter("ADMIN")}>
                <ShieldCheck /> Enter as Admin
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="panel p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Available lots</h3>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                {lots.length} active
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {lots.slice(0, 3).map((lot) => (
                <div key={lot.id} className="rounded-xl border border-border bg-elevated/70 p-3">
                  <p className="text-sm font-medium">{lot.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{lot.description}</p>
                  <p className="mt-2 numeric text-xs text-primary">{lot.current_price}</p>
                </div>
              ))}
            </div>
          </div>
          <Feature
            icon={<Gavel className="text-primary" />}
            title="Buyer view — /auction/:id"
            body="Live timer, quick bid at +$10 / +$50 / +$100, and a banner that flips between “You are winning” and “You were outbid” the moment someone else lands a bid."
          />
          <Feature
            icon={<ShieldCheck className="text-primary" />}
            title="Admin view — /admin/monitor"
            body="Streaming bid ticker, pause/resume the sale, void any bid (the price rolls back), and extend the clock to defuse a snipe. Guarded to role ADMIN."
          />
          <Feature
            icon={<Radio className="text-primary" />}
            title="Shared realtime state"
            body="Both views subscribe to the same Postgres change feed; bids are written through a transactional database function so two simultaneous bids can never corrupt the price."
          />
        </div>
      </section>

      <footer className="text-sm text-muted-foreground">
        Tip: open{" "}
        <span className="numeric text-foreground">/auction/{DEMO_AUCTION_ID.slice(0, 8)}…</span> in
        one window and <span className="numeric text-foreground">/admin/monitor</span> in another.
        <ArrowRight className="ml-2 inline size-4" />
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-6">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
