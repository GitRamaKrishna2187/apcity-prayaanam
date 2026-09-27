-- ══════════════════════════════════════════════════════════════════════════════
-- APCityPrayaanam — gender split on the simulated occupancy feed
--
-- Adds a female/male breakdown to occupancy_history so the Power BI dashboard
-- can report gender-segmented ridership WITHOUT anyone ticketing through the
-- app. The split is applied to seats_occupied on every insert, so the existing
-- `occupancy-snapshot` cron keeps working untouched and every future snapshot
-- picks it up automatically.
--
-- ⚠ THIS IS SIMULATED DATA. Label it as such on any slide. It is a modelling
--   assumption about ridership mix, not a measurement of it. The only real
--   gender data in this system comes from ticket_facts (see stree_shakti.sql),
--   which will be a far smaller but genuinely observed sample.
--
-- Run after stree_shakti.sql. Idempotent — safe to run repeatedly.
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. THE ASSUMPTION, MADE VISIBLE AND TUNABLE                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- The ratio lives in a table rather than inside the function body for two
-- reasons: a reviewer can read the assumption without reading PL/pgSQL, and
-- changing it is an UPDATE plus one backfill call, not a migration.

create table if not exists occupancy_mix_rules (
  segment      text primary key,
  female_pct   numeric not null check (female_pct between 0 and 100),
  note         text,
  updated_at   timestamptz not null default now()
);

insert into occupancy_mix_rules (segment, female_pct, note) values
  ('stree_shakti_eligible', 80,
   'Non-AC City Ordinary / Metro Express / Express. Free travel for women '
   'under Stree Shakti is expected to skew the mix heavily female.'),
  ('ac_excluded', 80,
   'AC services (Green Metro, 900, 900K). Stree Shakti does NOT cover these, '
   'so women pay full fare here and there is no fare incentive producing a '
   'female skew. Set to 80 only because the brief specified 80:20 across the '
   'whole day. If a reviewer challenges the ridership mix, this is the row '
   'to change — a value nearer 45-50 is easier to defend for AC services.')
on conflict (segment) do nothing;

comment on table occupancy_mix_rules is
  'Ridership gender-mix assumptions for the SIMULATED occupancy feed. Not '
  'observed data. After changing female_pct, run: select backfill_occupancy_gender();';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. COLUMNS                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table occupancy_history add column if not exists female_occupied int;
alter table occupancy_history add column if not exists male_occupied   int;

comment on column occupancy_history.female_occupied is
  'SIMULATED. Derived from seats_occupied via occupancy_mix_rules.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. THE SPLIT                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Male is computed as the remainder rather than as (1 - pct), so female + male
-- always equals seats_occupied exactly. Deriving both independently would let
-- rounding put a passenger in the bus who is neither, or drop one entirely —
-- and a total that does not tie out is the first thing a finance reviewer
-- checks.

-- Scalar, not set-returning: UPDATE ... FROM LATERAL f(target.col) is not
-- permitted in Postgres (the target row cannot be referenced from the FROM
-- clause), and the backfill below needs exactly that shape.
create or replace function occupancy_female_count(p_route text, p_seats int)
returns int language plpgsql stable set search_path = public as $$
declare v_pct numeric; v_ac boolean; v_female int;
begin
  if p_seats is null or p_seats <= 0 then return 0; end if;

  select r.ac into v_ac from routes r where r.route_no = p_route;

  select m.female_pct into v_pct
    from occupancy_mix_rules m
   where m.segment = case when coalesce(v_ac, false) then 'ac_excluded'
                          else 'stree_shakti_eligible' end;

  v_pct    := coalesce(v_pct, 80);
  v_female := round(p_seats * v_pct / 100.0);
  return least(greatest(v_female, 0), p_seats);
end $$;

-- Dropped: superseded by the scalar form above.
drop function if exists occupancy_gender_split(text, int);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. TRIGGER — so the existing cron does not need touching                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- The `occupancy-snapshot` job inserts into this table every 15 minutes. Rather
-- than rewrite that job (and risk breaking a working generator), the split is
-- applied by a BEFORE INSERT trigger. Any insert path — cron, manual, a future
-- real feed — gets the breakdown for free.

create or replace function fill_occupancy_gender()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.female_occupied is null or new.male_occupied is null then
    new.female_occupied := occupancy_female_count(new.route_no, new.seats_occupied);
    new.male_occupied   := coalesce(new.seats_occupied, 0) - new.female_occupied;
  end if;
  return new;
end $$;

drop trigger if exists trg_occupancy_gender on occupancy_history;
create trigger trg_occupancy_gender
  before insert on occupancy_history
  for each row execute function fill_occupancy_gender();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. BACKFILL                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Re-runnable: recomputes every row from the current rules, so this is also
-- how you apply a changed female_pct to history.

create or replace function backfill_occupancy_gender()
returns bigint language plpgsql set search_path = public as $$
declare n bigint;
begin
  update occupancy_history oh
     set female_occupied = occupancy_female_count(oh.route_no, oh.seats_occupied);
  get diagnostics n = row_count;

  update occupancy_history oh
     set male_occupied = coalesce(oh.seats_occupied, 0) - coalesce(oh.female_occupied, 0);

  return n;
end $$;

select backfill_occupancy_gender() as rows_backfilled;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. VIEW FOR POWER BI                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Point the dashboard's gender visuals at this, not at occupancy_history
-- directly: it carries the same Many-to-one relationship shape and adds the
-- route attributes the existing measures already slice by.

drop view if exists occupancy_gender_facts;

create view occupancy_gender_facts as
select
  oh.id,
  oh.registration,
  oh.route_no,
  r.bus_type,
  r.depot,
  r.ac,
  coalesce(r.capacity, 52)                                  as capacity,
  oh.status,
  oh.seats_occupied,
  oh.female_occupied,
  oh.male_occupied,
  round(100.0 * oh.seats_occupied / nullif(r.capacity, 0), 2) as occupancy_pct,
  round(100.0 * oh.female_occupied
        / nullif(oh.seats_occupied, 0), 2)                   as female_share_pct,
  oh.recorded_at,
  (oh.recorded_at at time zone 'Asia/Kolkata')::date         as service_date,
  extract(hour from oh.recorded_at at time zone 'Asia/Kolkata')::int as hour_ist
from occupancy_history oh
left join routes r on r.route_no = oh.route_no;


notify pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. VERIFY                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

select segment, female_pct, 100 - female_pct as male_pct from occupancy_mix_rules order by segment;

-- Totals must tie out exactly: no passenger created or lost by rounding.
select
  count(*)                                              as snapshots,
  sum(seats_occupied)                                   as total_seats,
  sum(female_occupied)                                  as female,
  sum(male_occupied)                                    as male,
  case when sum(seats_occupied) = sum(female_occupied) + sum(male_occupied)
       then 'BALANCED' else 'MISMATCH' end              as reconciliation,
  round(100.0 * sum(female_occupied) / nullif(sum(seats_occupied), 0), 1) as female_share_pct
from occupancy_history;

-- Hourly shape, to confirm the split holds at every occupancy level.
select hour_ist,
       round(avg(occupancy_pct), 1)    as avg_occupancy_pct,
       sum(female_occupied)            as female,
       sum(male_occupied)              as male,
       round(avg(female_share_pct), 1) as female_share_pct
from occupancy_gender_facts
where seats_occupied > 0
group by hour_ist order by hour_ist;
