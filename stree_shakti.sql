-- ══════════════════════════════════════════════════════════════════════════════
-- APCityPrayaanam — Stree Shakti concession + gender-segmented ridership
--
-- Implements the AP Government's Stree Shakti free bus travel scheme (GO dated
-- 11 Aug 2025, launched 15 Aug 2025) inside the ticketing and ePass layers.
--
-- ⚠ POLICY BOUNDARY — READ BEFORE CHANGING ANY OF THIS
-- The scheme applies ONLY to: Pallevelugu, Ultra Pallevelugu, City Ordinary,
-- Metro Express and Express services. It explicitly EXCLUDES all AC products,
-- Super Luxury, Ultra Deluxe, Star Liner, Saptagiri Express, non-stop,
-- interstate, contract carriage, chartered and package services.
--
-- In this schema that means: city_ordinary and metro_express qualify,
-- metro_luxury does NOT, and any route with routes.ac = true is excluded
-- regardless of its bus_type. Both tests are applied — bus_type alone is not
-- sufficient, because route 2047 is metro_luxury with ac=false while routes
-- 900/900K are metro_luxury with ac=true.
--
-- The GO also says extending the scheme to ELECTRIC buses is "to be thought
-- over, subject to Cabinet approval" — i.e. undecided. The Green Metro e-buses
-- arriving from 1 Oct 2025 therefore sit in an open gap. That is exactly why
-- eligibility is a DATA FLAG you can flip per bus_type, not a hardcoded rule.
--
-- Run after eticket.sql and eticket_lifecycle.sql.
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ELIGIBILITY FLAG                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table fare_rules add column if not exists stree_shakti_eligible boolean not null default false;

update fare_rules set stree_shakti_eligible = true  where bus_type in ('city_ordinary','metro_express');
update fare_rules set stree_shakti_eligible = false where bus_type = 'metro_luxury';

comment on column fare_rules.stree_shakti_eligible is
  'Whether this service class is covered by the Stree Shakti free-travel GO. '
  'AND-ed with NOT routes.ac at fare time — an AC route is never eligible even '
  'if its bus_type is. Flip metro_luxury to true only if Cabinet extends the '
  'scheme to electric/AC buses.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. GENDER + CONCESSION COLUMNS                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 'transgender' is included because the GO names "all the girls, women and
-- transgender individuals" as beneficiaries. 'unspecified' exists so a
-- passenger who declines to state one still gets a ticket — at full fare,
-- since the concession requires a declared eligible category.

do $$ begin
  create type gender_t as enum ('male','female','transgender','unspecified');
exception when duplicate_object then null; end $$;

-- ── tickets ────────────────────────────────────────────────────────────────
alter table tickets add column if not exists gender gender_t not null default 'unspecified';

-- A booking can be mixed (a family travelling together), so the concession is
-- counted per head rather than as a single flag on the booking.
alter table tickets add column if not exists concession_passengers int not null default 0;
alter table tickets add column if not exists gross_fare        numeric;
alter table tickets add column if not exists concession_amount numeric not null default 0;
alter table tickets add column if not exists concession_scheme text;

-- Backfill: every pre-existing ticket was full-fare.
update tickets set gross_fare = total_fare where gross_fare is null;

alter table tickets add constraint tickets_concession_ck
  check (concession_passengers between 0 and passengers) not valid;
alter table tickets validate constraint tickets_concession_ck;

comment on column tickets.gross_fare is
  'Notional fare at full tariff (fare_each x passengers). Retained even when '
  'total_fare is 0 — APSRTC claims state reimbursement AT the notional value, '
  'so a zero-fare ticket is a claim record, not an absence of revenue.';

-- ── epasses ────────────────────────────────────────────────────────────────
alter table epasses add column if not exists gender gender_t not null default 'unspecified';

-- Stree Shakti pass = a zero-cost identity credential, NOT a fare product.
-- It does not buy travel; it proves the holder qualifies for travel the state
-- already pays for, so the conductor does not re-check Aadhaar every trip.
alter table epasses drop constraint if exists epasses_pass_type_check;
alter table epasses add constraint epasses_pass_type_check
  check (pass_type in ('daily','monthly','student','senior','stree_shakti'));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. FARE QUOTE — concession applied server-side                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function quote_fare(
  p_route text, p_from text, p_to text,
  p_passengers int default 1,
  p_gender text default 'unspecified',
  p_concession_passengers int default 0
) returns jsonb language plpgsql stable set search_path = public as $$
declare
  r        record;
  fr       fare_rules%rowtype;
  v_km     numeric;
  v_base   numeric;
  v_each   numeric;
  v_pax    int := greatest(1, p_passengers);
  v_elig   boolean;
  v_conc_n int;
  v_gross  numeric;
  v_conc   numeric;
begin
  select route_no, route_name, bus_type, ac, depot into r
    from routes where route_no = p_route;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Unknown route');
  end if;

  v_km := route_segment_km(p_route, p_from, p_to);
  if v_km is null then
    return jsonb_build_object('ok', false,
      'reason', 'Those stops are not both on this route');
  end if;

  select * into fr from fare_rules where bus_type = r.bus_type;
  if not found then select * into fr from fare_rules where bus_type = 'city_ordinary'; end if;

  if not fr.ticketing_open then
    return jsonb_build_object('ok', false,
      'reason', 'e-Ticketing is not open on ' || fr.label || ' services yet');
  end if;

  -- Full tariff first. The concession is a deduction from a real fare, never a
  -- reason to skip computing one — the notional value is what gets reimbursed.
  v_base := greatest(fr.min_fare, fr.min_fare + (v_km * fr.per_km));
  if r.ac then v_base := v_base * (1 + fr.ac_surcharge_pct / 100.0); end if;
  v_each  := ceil(v_base / fr.round_to) * fr.round_to;
  v_gross := v_each * v_pax;

  -- BOTH tests: the service class must be covered AND the route must not be AC.
  v_elig := fr.stree_shakti_eligible and not r.ac;

  -- How many heads travel free. A single declared female/transgender booker
  -- implies at least one; an explicit count wins for mixed group bookings.
  v_conc_n := greatest(
      coalesce(p_concession_passengers, 0),
      case when p_gender in ('female','transgender') then 1 else 0 end);
  v_conc_n := least(v_conc_n, v_pax);
  if not v_elig then v_conc_n := 0; end if;

  v_conc := v_each * v_conc_n;

  return jsonb_build_object(
    'ok', true,
    'route_no', r.route_no, 'route_name', r.route_name,
    'bus_type', r.bus_type, 'bus_label', fr.label, 'ac', r.ac,
    'from_stop', p_from, 'to_stop', p_to,
    'distance_km', v_km,
    'fare_each', v_each,
    'passengers', v_pax,
    'gross_fare', v_gross,
    'stree_shakti_eligible', v_elig,
    'concession_passengers', v_conc_n,
    'concession_amount', v_conc,
    'concession_scheme', case when v_conc > 0 then 'stree_shakti' else null end,
    'total_fare', v_gross - v_conc,
    -- Why a woman is being charged on this service. Shown in the app, because
    -- "why am I paying when travel is free?" is the single most predictable
    -- passenger complaint this feature will generate at a depot counter.
    'ineligible_reason', case
      when v_elig then null
      when r.ac then 'AC service — Stree Shakti does not cover air-conditioned buses'
      else fr.label || ' is outside the Stree Shakti scheme'
    end
  );
end $$;

revoke all on function quote_fare(text, text, text, int, text, int) from public;
grant execute on function quote_fare(text, text, text, int, text, int) to anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. ISSUE — zero-fare tickets are issued, not skipped                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- A fully-concessional ticket goes straight to 'issued': there is nothing to
-- pay, so parking it in 'awaiting_payment' would strand the passenger behind a
-- UPI screen for a ₹0 charge.

create or replace function issue_ticket(
  p_route text, p_from text, p_to text,
  p_passengers int default 1, p_mobile text default null,
  p_gender text default 'unspecified',
  p_concession_passengers int default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q       jsonb;
  v_no    text;
  v_id    uuid;
  v_tok   uuid;
  v_total numeric;
  v_free  boolean;
begin
  q := quote_fare(p_route, p_from, p_to, p_passengers, p_gender, p_concession_passengers);
  if not (q->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', q->>'reason');
  end if;

  v_total := (q->>'total_fare')::numeric;
  v_free  := v_total <= 0;
  v_no    := gen_ticket_no();

  insert into tickets (ticket_no, mobile, route_no, route_name, bus_type,
                       from_stop, to_stop, distance_km, passengers,
                       fare_each, gross_fare, concession_passengers,
                       concession_amount, concession_scheme, total_fare,
                       gender, status, payment_method, payment_verified,
                       issued_at, valid_until)
  values (v_no, p_mobile, q->>'route_no', q->>'route_name', q->>'bus_type',
          p_from, p_to, (q->>'distance_km')::numeric, greatest(1, p_passengers),
          (q->>'fare_each')::numeric, (q->>'gross_fare')::numeric,
          (q->>'concession_passengers')::int,
          (q->>'concession_amount')::numeric, q->>'concession_scheme', v_total,
          coalesce(nullif(p_gender,'')::gender_t, 'unspecified'),
          case when v_free then 'issued' else 'awaiting_payment' end,
          case when v_free then 'stree_shakti_zero_fare' else null end,
          -- A state-funded zero-fare ticket needs no bank callback to be genuine.
          v_free,
          case when v_free then now() else null end,
          case when v_free then now() + interval '3 hours' else null end)
  returning id, access_token into v_id, v_tok;

  return jsonb_build_object(
    'ok', true, 'ticket_no', v_no, 'access_token', v_tok,
    'total_fare', v_total, 'zero_fare', v_free, 'quote', q);
end $$;

revoke all on function issue_ticket(text, text, text, int, text, text, int) from public;
grant execute on function issue_ticket(text, text, text, int, text, text, int) to anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. HOLDER READ — surface the concession on the ticket                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
drop function if exists get_my_ticket(text, uuid);

create function get_my_ticket(p_ticket_no text, p_token uuid)
returns table (
  ticket_no text, route_no text, route_name text, bus_type text,
  from_stop text, to_stop text, distance_km numeric, passengers int,
  fare_each numeric, gross_fare numeric, concession_passengers int,
  concession_amount numeric, concession_scheme text, total_fare numeric,
  gender text, status text,
  payment_verified boolean, issued_at timestamptz, valid_until timestamptz,
  used_at timestamptz, used_bus text, expected_arrival timestamptz,
  est_journey_mins int, qr_secret text
)
language sql stable security definer set search_path = public as $$
  select t.ticket_no, t.route_no, t.route_name, t.bus_type,
         t.from_stop, t.to_stop, t.distance_km, t.passengers,
         t.fare_each, t.gross_fare, t.concession_passengers,
         t.concession_amount, t.concession_scheme, t.total_fare,
         t.gender::text,
         case
           when t.status = 'used'   and t.expected_arrival < now() then 'completed'
           when t.status = 'issued' and t.valid_until      < now() then 'expired'
           else t.status
         end as status,
         t.payment_verified, t.issued_at, t.valid_until,
         t.used_at, t.used_bus, t.expected_arrival, t.est_journey_mins,
         case when t.status = 'issued' and t.valid_until > now()
              then t.qr_secret else null end as qr_secret
  from tickets t
  where t.ticket_no = p_ticket_no and t.access_token = p_token
$$;

revoke all on function get_my_ticket(text, uuid) from public;
grant execute on function get_my_ticket(text, uuid) to anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. REVENUE + RIDERSHIP VIEWS (what Power BI reads)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Grain: one row per ticket. Point Power BI at this, not at `tickets` — it
-- carries the derived passenger split so the DAX measures stay one-liners.
create or replace view ticket_facts as
select
  t.ticket_no,
  t.route_no,
  t.route_name,
  t.bus_type,
  coalesce(f.label, t.bus_type)                       as bus_label,
  r.depot,
  r.ac,
  coalesce(f.stree_shakti_eligible, false) and not coalesce(r.ac, false)
                                                      as service_eligible,
  t.gender::text                                      as gender,
  t.from_stop, t.to_stop, t.distance_km,
  t.passengers,
  t.concession_passengers                             as free_passengers,
  t.passengers - t.concession_passengers              as paying_passengers,
  coalesce(t.gross_fare, t.total_fare)                as gross_fare,
  t.concession_amount,
  t.total_fare                                        as net_revenue,
  t.concession_scheme,
  (t.total_fare = 0)                                  as is_zero_fare,
  t.status,
  t.payment_verified,
  t.issued_at,
  (t.issued_at at time zone 'Asia/Kolkata')::date     as service_date,
  t.used_at
from tickets t
left join routes      r on r.route_no = t.route_no
left join fare_rules  f on f.bus_type = t.bus_type
where t.issued_at is not null;

-- Daily roll-up, including the state reimbursement claim line.
create or replace view eticket_revenue_daily as
select
  service_date,
  bus_type, bus_label, route_no, depot,
  count(*)                                        as tickets_sold,
  count(*) filter (where is_zero_fare)            as zero_fare_tickets,
  count(*) filter (where not is_zero_fare)        as paid_tickets,
  sum(passengers)                                 as passengers,
  sum(free_passengers)                            as free_passengers,
  sum(paying_passengers)                          as paying_passengers,
  sum(gross_fare)                                 as gross_fare,
  sum(concession_amount)                          as stree_shakti_claim,
  sum(net_revenue)                                as net_revenue,
  round(avg(nullif(net_revenue, 0)), 2)           as avg_paid_fare,
  round(avg(distance_km), 2)                      as avg_trip_km,
  count(*) filter (where status = 'used'
                      or status = 'completed')    as tickets_validated,
  count(*) filter (where not payment_verified
                      and not is_zero_fare)       as unverified_payments
from ticket_facts
group by 1,2,3,4,5
order by service_date desc, net_revenue desc;

-- Gender split of actual ridership. This is the table that replaces the
-- "epasses has no demographic field" gap flagged in the advertising thesis.
create or replace view ridership_gender_daily as
select
  service_date,
  route_no,
  bus_type,
  gender,
  count(*)               as tickets,
  sum(passengers)        as passengers,
  sum(net_revenue)       as net_revenue,
  sum(concession_amount) as concession_amount
from ticket_facts
group by 1,2,3,4
order by service_date desc, passengers desc;


notify pgrst, 'reload schema';

-- ── Verify ─────────────────────────────────────────────────────────────────
select bus_type, label, stree_shakti_eligible from fare_rules order by bus_type;

-- A woman on a non-AC city route → ₹0, concession recorded.
-- select quote_fare('111','NAD Junction','Gurudwara Junction',1,'female',1);
-- A woman on an AC Green Metro route → full fare, with the reason stated.
-- select quote_fare('900','Maddilapalem','Railway Station',1,'female',1);
