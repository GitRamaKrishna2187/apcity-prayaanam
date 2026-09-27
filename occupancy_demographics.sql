-- ══════════════════════════════════════════════════════════════════════════════
-- APCityPrayaanam — age bands on the simulated occupancy feed
--                 + corrected metric definitions for the investor dashboard
--
-- TWO JOBS:
--   1. Add simulated age-band counts alongside the gender split.
--   2. Fix a naming defect that makes the current dashboard indefensible.
--
-- ⚠ THE NAMING DEFECT — READ THIS BEFORE BUILDING ANY INVESTOR VISUAL
--
--   occupancy_history holds a snapshot of every running bus every 15 minutes.
--   The average route runs 69 minutes, so ONE passenger is recorded in roughly
--   4.6 consecutive snapshots.
--
--   SUM(seats_occupied) is therefore NOT a passenger count. It is a count of
--   passenger-snapshots, inflated ~4.6x. The current dashboard shows 688,212
--   of these labelled "Total Passengers", against ~149,000 actual boardings.
--
--   Separately, COUNTROWS(occupancy_history) = 21,799 is labelled "Passengers
--   Count _7 days" but counts SNAPSHOTS, not passengers.
--
--   So two tiles both claim to count passengers, disagree by 32x, and neither
--   is a passenger count. This view gives each quantity its true name:
--
--     snapshots           observations of a bus         (21,799)
--     passenger_snapshots seats summed across snapshots (688,212)
--     est_boardings       passenger_snapshots / 4.6     (~149,000)
--     passenger_minutes   passenger_snapshots x 15      (10.3M)  <- ad exposure
--
--   The 688,212 figure is not wrong — it is the right number for advertising
--   exposure and the wrong number for ridership. Naming fixes it; deleting it
--   would throw away the strongest metric in the ad model.
--
-- Run after occupancy_gender_split.sql. Idempotent.
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. AGE-BAND ASSUMPTIONS — visible and tunable, like the gender rules     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists occupancy_age_rules (
  band        text primary key,
  sort_order  int  not null,
  share_pct   numeric not null check (share_pct between 0 and 100),
  note        text,
  updated_at  timestamptz not null default now()
);

insert into occupancy_age_rules (band, sort_order, share_pct, note) values
  ('Under 18', 1, 12, 'School and junior college students.'),
  ('18-25',    2, 28, 'Students and early-career commuters — the segment most '
                      'attractive to advertisers and the heaviest transit users.'),
  ('26-40',    3, 30, 'Core working-age commuters.'),
  ('41-60',    4, 22, 'Older working-age commuters.'),
  ('Over 60',  5,  8, 'Senior citizens.')
on conflict (band) do nothing;

comment on table occupancy_age_rules is
  'SIMULATED age-mix assumptions for the occupancy feed. These are modelling '
  'inputs, not observations — no age is captured at boarding. The only real '
  'age data in this system comes from epasses.dob. After changing share_pct, '
  'run: select backfill_occupancy_age();';

-- Shares must total 100, or every derived percentage is quietly wrong.
create or replace function check_age_rules_total()
returns text language sql stable set search_path = public as $$
  select case when abs(sum(share_pct) - 100) < 0.01
              then '✅ shares total 100'
              else '⚠ shares total ' || sum(share_pct) || ' — fix before trusting any age visual'
         end from occupancy_age_rules
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. COLUMNS                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table occupancy_history add column if not exists age_u18   int;
alter table occupancy_history add column if not exists age_18_25 int;
alter table occupancy_history add column if not exists age_26_40 int;
alter table occupancy_history add column if not exists age_41_60 int;
alter table occupancy_history add column if not exists age_60p   int;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. THE SPLIT                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Largest-remainder allocation: four bands are rounded down, and the biggest
-- band absorbs whatever is left over. Rounding each band independently would
-- let the five columns sum to more or fewer than seats_occupied, and a
-- demographic table whose total does not match the ridership total is the
-- first thing a diligence analyst will notice.

create or replace function occupancy_age_split(p_seats int)
returns table (u18 int, a18_25 int, a26_40 int, a41_60 int, a60p int)
language plpgsql stable set search_path = public as $$
declare
  s1 numeric; s2 numeric; s3 numeric; s4 numeric; s5 numeric;
  v1 int; v2 int; v3 int; v4 int; v5 int;
begin
  if p_seats is null or p_seats <= 0 then
    return query select 0,0,0,0,0; return;
  end if;

  select share_pct into s1 from occupancy_age_rules where band = 'Under 18';
  select share_pct into s2 from occupancy_age_rules where band = '18-25';
  select share_pct into s3 from occupancy_age_rules where band = '26-40';
  select share_pct into s4 from occupancy_age_rules where band = '41-60';
  select share_pct into s5 from occupancy_age_rules where band = 'Over 60';
  s1:=coalesce(s1,12); s2:=coalesce(s2,28); s3:=coalesce(s3,30);
  s4:=coalesce(s4,22); s5:=coalesce(s5,8);

  -- Round every band, INCLUDING the largest, then give the largest band the
  -- signed difference so the five always sum to seats_occupied exactly.
  --
  -- The earlier version floored four bands and gave 26-40 whatever was left,
  -- which dumped up to four lost fractions into one band and rendered a
  -- configured 30% as 35.2% on the real data. Rounding without the correction
  -- fixed the bias but broke the tie-out, because rounding can overshoot.
  -- This does both: unbiased bands AND an exact total.
  v1 := round(p_seats * s1 / 100.0);
  v2 := round(p_seats * s2 / 100.0);
  v3 := round(p_seats * s3 / 100.0);
  v4 := round(p_seats * s4 / 100.0);
  v5 := round(p_seats * s5 / 100.0);
  v3 := v3 + (p_seats - (v1 + v2 + v3 + v4 + v5));

  -- A tiny bus can still drive the correction negative; move the shortfall to
  -- the next largest band rather than clamping, which would break the sum.
  if v3 < 0 then v2 := v2 + v3; v3 := 0; end if;
  if v2 < 0 then v1 := v1 + v2; v2 := 0; end if;
  if v1 < 0 then v4 := v4 + v1; v1 := 0; end if;

  return query select v1, v2, v3, v4, v5;
end $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. TRIGGER — extends the existing gender trigger                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function fill_occupancy_demographics()
returns trigger language plpgsql set search_path = public as $$
declare a record;
begin
  if new.female_occupied is null or new.male_occupied is null then
    new.female_occupied := occupancy_female_count(new.route_no, new.seats_occupied);
    new.male_occupied   := coalesce(new.seats_occupied, 0) - new.female_occupied;
  end if;

  if new.age_26_40 is null then
    select * into a from occupancy_age_split(new.seats_occupied);
    new.age_u18   := a.u18;
    new.age_18_25 := a.a18_25;
    new.age_26_40 := a.a26_40;
    new.age_41_60 := a.a41_60;
    new.age_60p   := a.a60p;
  end if;

  return new;
end $$;

-- Supersedes the gender-only trigger from occupancy_gender_split.sql.
drop trigger if exists trg_occupancy_gender on occupancy_history;
drop trigger if exists trg_occupancy_demographics on occupancy_history;
create trigger trg_occupancy_demographics
  before insert on occupancy_history
  for each row execute function fill_occupancy_demographics();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. BACKFILL                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Reads the rules once into variables and does the whole table in a single
-- arithmetic pass. UPDATE ... FROM f(target.column) is not permitted in
-- Postgres (the target row cannot be referenced from the FROM clause), and a
-- per-row scalar subquery would call the function five times for each of
-- 21,799 rows for no benefit.
create or replace function backfill_occupancy_age()
returns bigint language plpgsql set search_path = public as $$
declare n bigint;
begin
  -- Delegates to occupancy_age_split so the backfill and the insert trigger
  -- can never disagree about the allocation. One definition, two callers.
  -- The LATERAL lives inside a CTE. UPDATE ... FROM f(target.column) is not
  -- permitted in Postgres — the target row cannot be referenced from the
  -- UPDATE's own FROM clause — so the calculation is done in a SELECT first
  -- and joined back by id.
  with calc as (
    select oh.id, a.u18, a.a18_25, a.a26_40, a.a41_60, a.a60p
      from occupancy_history oh
      cross join lateral occupancy_age_split(oh.seats_occupied) a
     where oh.seats_occupied is not null
  )
  update occupancy_history t
     set age_u18   = c.u18,    age_18_25 = c.a18_25, age_26_40 = c.a26_40,
         age_41_60 = c.a41_60, age_60p   = c.a60p
    from calc c
   where c.id = t.id;
  get diagnostics n = row_count;
  return n;
end $$;

select backfill_occupancy_age() as rows_backfilled;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. THE INVESTOR-FACING VIEW                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- One fact table for the whole dashboard. Every quantity is named for what it
-- actually is, so no measure built on it can accidentally claim to count
-- passengers when it counts observations.

-- Drop child-first: ridership_age_long selects from ridership_facts, so
-- dropping the parent while the child exists fails on every re-run.
drop view if exists ridership_age_long;
drop view if exists occupancy_gender_facts;
drop view if exists ridership_facts;

create view ridership_facts as
select
  oh.id,
  oh.registration,
  oh.route_no,
  r.route_name,
  r.bus_type,
  r.depot,
  r.ac,
  coalesce(r.capacity, 52)        as capacity,
  coalesce(r.duration_mins, 60)   as route_duration_mins,
  oh.status,

  -- ── volume, each under its true name ────────────────────────────────────
  1                               as snapshot,
  oh.seats_occupied               as passenger_snapshots,
  oh.seats_occupied * 15          as passenger_minutes,
  -- Deflate by how many 15-min snapshots one journey spans, so a passenger is
  -- counted once per journey rather than once per observation.
  oh.seats_occupied
    / greatest(coalesce(r.duration_mins, 60) / 15.0, 1)::numeric
                                  as est_boardings,

  -- ── demographics (SIMULATED) ────────────────────────────────────────────
  oh.female_occupied, oh.male_occupied,
  oh.age_u18, oh.age_18_25, oh.age_26_40, oh.age_41_60, oh.age_60p,

  round(100.0 * oh.seats_occupied / nullif(r.capacity, 0), 2) as occupancy_pct,

  oh.recorded_at,
  (oh.recorded_at at time zone 'Asia/Kolkata')::date               as service_date,
  extract(hour from oh.recorded_at at time zone 'Asia/Kolkata')::int as hour_ist,
  case
    when extract(hour from oh.recorded_at at time zone 'Asia/Kolkata') between 6 and 8  then 'Morning Peak'
    when extract(hour from oh.recorded_at at time zone 'Asia/Kolkata') between 17 and 19 then 'Evening Peak'
    else 'Off-Peak'
  end                                                              as day_part
from occupancy_history oh
left join routes r on r.route_no = oh.route_no;

comment on view ridership_facts is
  'Single fact table for the investor dashboard. passenger_snapshots is an '
  'EXPOSURE metric (ad impressions); est_boardings is the RIDERSHIP metric. '
  'They differ by ~4.6x and must never be used interchangeably.';


-- Long-form age, so one bar chart can render all five bands without five
-- separate measures.
drop view if exists ridership_age_long;

create view ridership_age_long as
select f.service_date, f.route_no, f.depot, f.bus_type, f.ac, f.day_part, f.hour_ist,
       x.band, x.sort_order, x.passengers
from ridership_facts f
cross join lateral (values
    ('Under 18', 1, f.age_u18),
    ('18-25',    2, f.age_18_25),
    ('26-40',    3, f.age_26_40),
    ('41-60',    4, f.age_41_60),
    ('Over 60',  5, f.age_60p)
  ) as x(band, sort_order, passengers)
where x.passengers is not null;


notify pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. VERIFY                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

select check_age_rules_total() as age_rules;

select band, share_pct from occupancy_age_rules order by sort_order;

-- Age bands must sum exactly to seats_occupied.
select
  sum(seats_occupied) as total_seats,
  sum(age_u18 + age_18_25 + age_26_40 + age_41_60 + age_60p) as age_total,
  case when sum(seats_occupied) = sum(age_u18+age_18_25+age_26_40+age_41_60+age_60p)
       then 'BALANCED' else 'MISMATCH' end as age_reconciliation,
  case when sum(seats_occupied) = sum(female_occupied + male_occupied)
       then 'BALANCED' else 'MISMATCH' end as gender_reconciliation
from occupancy_history;

-- The three volume metrics side by side — this is the table that shows why
-- the old dashboard disagreed with itself.
select
  count(*)                        as snapshots,
  sum(passenger_snapshots)        as passenger_snapshots,
  round(sum(est_boardings))       as est_boardings,
  sum(passenger_minutes)          as passenger_minutes,
  count(distinct service_date)    as service_days
from ridership_facts;
