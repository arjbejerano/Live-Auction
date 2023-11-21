CREATE TYPE public.auction_status AS ENUM ('LIVE','PAUSED','ENDED');

CREATE TABLE public.auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  starting_price numeric(12,2) NOT NULL DEFAULT 0,
  current_price numeric(12,2) NOT NULL DEFAULT 0,
  min_increment numeric(12,2) NOT NULL DEFAULT 10,
  ends_at timestamptz NOT NULL,
  status public.auction_status NOT NULL DEFAULT 'LIVE',
  anti_snipe_window_seconds int NOT NULL DEFAULT 30,
  anti_snipe_extend_seconds int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  bidder_id text NOT NULL,
  bidder_name text NOT NULL,
  amount numeric(12,2) NOT NULL,
  voided boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bids_auction_created_idx ON public.bids (auction_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auctions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bids TO authenticated;
GRANT SELECT ON public.auctions TO anon;
GRANT SELECT ON public.bids TO anon;
GRANT ALL ON public.auctions TO service_role;
GRANT ALL ON public.bids TO service_role;

ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auctions are publicly viewable" ON public.auctions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Bids are publicly viewable" ON public.bids FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER auctions_updated_at BEFORE UPDATE ON public.auctions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Place a bid: validates increment, auction state and applies anti-sniping extension.
CREATE OR REPLACE FUNCTION public.place_bid(
  p_auction_id uuid,
  p_bidder_id text,
  p_bidder_name text,
  p_amount numeric
) RETURNS public.bids
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.auctions; b public.bids;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF a.status = 'PAUSED' THEN RAISE EXCEPTION 'Auction is paused by an administrator'; END IF;
  IF a.status = 'ENDED' OR a.ends_at <= now() THEN RAISE EXCEPTION 'Auction has ended'; END IF;
  IF p_amount < a.current_price + a.min_increment THEN
    RAISE EXCEPTION 'Bid must be at least %', a.current_price + a.min_increment;
  END IF;

  INSERT INTO public.bids (auction_id, bidder_id, bidder_name, amount)
  VALUES (p_auction_id, p_bidder_id, left(p_bidder_name, 40), p_amount)
  RETURNING * INTO b;

  UPDATE public.auctions
     SET current_price = p_amount,
         ends_at = CASE
           WHEN ends_at - now() < make_interval(secs => anti_snipe_window_seconds)
           THEN ends_at + make_interval(secs => anti_snipe_extend_seconds)
           ELSE ends_at END
   WHERE id = p_auction_id;

  RETURN b;
END; $$;

-- Admin: void a bid and roll the price back to the highest remaining valid bid.
CREATE OR REPLACE FUNCTION public.void_bid(p_bid_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_auction uuid; v_price numeric;
BEGIN
  UPDATE public.bids SET voided = true WHERE id = p_bid_id RETURNING auction_id INTO v_auction;
  IF v_auction IS NULL THEN RAISE EXCEPTION 'Bid not found'; END IF;
  SELECT COALESCE(MAX(amount), (SELECT starting_price FROM public.auctions WHERE id = v_auction))
    INTO v_price FROM public.bids WHERE auction_id = v_auction AND voided = false;
  UPDATE public.auctions SET current_price = v_price WHERE id = v_auction;
END; $$;

-- Admin: pause / resume.
CREATE OR REPLACE FUNCTION public.set_auction_status(p_auction_id uuid, p_status public.auction_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.auctions SET status = p_status WHERE id = p_auction_id;
END; $$;

-- Admin: anti-sniping clock extender.
CREATE OR REPLACE FUNCTION public.extend_auction(p_auction_id uuid, p_seconds int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.auctions
     SET ends_at = GREATEST(ends_at, now()) + make_interval(secs => p_seconds)
   WHERE id = p_auction_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.place_bid(uuid, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_bid(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_auction_status(uuid, public.auction_status) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_auction(uuid, int) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
ALTER TABLE public.auctions REPLICA IDENTITY FULL;
ALTER TABLE public.bids REPLICA IDENTITY FULL;

INSERT INTO public.auctions (id, title, description, image_url, starting_price, current_price, min_increment, ends_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Patek Philippe Nautilus 5711 — Steel',
  'Reference 5711/1A-010, 2019 full set with box and papers. Independently authenticated, unpolished case, running within COSC tolerance.',
  null,
  24000, 24850, 50,
  now() + interval '5 minutes'
);

INSERT INTO public.bids (auction_id, bidder_id, bidder_name, amount, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'seed-marcus', 'Marcus V.', 24500, now() - interval '90 seconds'),
  ('11111111-1111-4111-8111-111111111111', 'seed-lena', 'Lena K.', 24850, now() - interval '25 seconds');