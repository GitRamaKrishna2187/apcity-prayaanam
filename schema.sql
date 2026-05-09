-- ══════════════════════════════════════════════════
-- APCityPrayaanam — Supabase Database Schema
-- Run this entire file in Supabase SQL Editor
-- ══════════════════════════════════════════════════

-- 1. ROUTES master table
create table if not exists routes (
  id              uuid primary key default gen_random_uuid(),
  route_no        text not null unique,
  route_name      text not null,
  from_stop       text not null,
  to_stop         text not null,
  bus_type        text not null check (bus_type in ('city_ordinary','metro_express','metro_luxury')),
  ac              boolean default false,
  depot           text not null,
  capacity        int not null default 52,
  fleet_size      int not null default 5,
  distance_km     numeric not null,
  duration_mins   int not null,
  first_departure text not null,
  last_departure  text not null,
  created_at      timestamptz default now()
);

-- 2. BUS STOPS — all stops per route
create table if not exists bus_stops (
  id          uuid primary key default gen_random_uuid(),
  stop_name   text not null,
  route_no    text not null references routes(route_no) on delete cascade,
  stop_index  int not null,
  city        text not null default 'Visakhapatnam',
  district    text not null default 'Visakhapatnam',
  landmark    text,
  latitude    numeric not null,
  longitude   numeric not null,
  created_at  timestamptz default now(),
  unique (route_no, stop_index)
);

-- 3. BUSES — individual bus records with live position
create table if not exists buses (
  id                  uuid primary key default gen_random_uuid(),
  registration        text not null unique,
  route_no            text not null references routes(route_no) on delete cascade,
  status              text not null default 'running'
                      check (status in ('running','delayed','depot','breakdown')),
  current_stop_index  int not null default 1,
  seats_occupied      int not null default 0,
  departure_time      text not null,
  arrival_time        text not null,
  driver_name         text,
  driver_mobile       text,
  delay_mins          int not null default 0,
  last_gps_update     timestamptz default now(),
  created_at          timestamptz default now()
);

-- 4. ePASS applications
create table if not exists epasses (
  id             uuid primary key default gen_random_uuid(),
  pass_id        text not null unique,
  holder_name    text not null,
  aadhaar_last4  text not null,
  mobile         text not null,
  pass_type      text not null check (pass_type in ('daily','monthly','student','senior')),
  route          text not null,
  cfms_id        text,
  org_name       text,
  payment_method text not null default 'UPI Autopay',
  amount         numeric not null default 0,
  status         text not null default 'pending'
                 check (status in ('active','pending','rejected','expired')),
  valid_from     date not null default current_date,
  valid_until    date not null,
  auto_renewal   boolean default true,
  rejection_reason text,
  approved_by    text,
  approved_at    timestamptz,
  created_at     timestamptz default now()
);

-- 5. BREAKDOWN cases
create table if not exists breakdown_cases (
  id                uuid primary key default gen_random_uuid(),
  incident_id       text not null unique,
  bus_registration  text not null,
  route_no          text not null,
  location          text not null,
  reported_at       timestamptz default now(),
  issue_type        text not null,
  severity          text not null default 'medium'
                    check (severity in ('low','medium','high','critical')),
  passengers_on_board int not null default 0,
  recovery_sent     boolean default false,
  status            text not null default 'open'
                    check (status in ('open','under_recovery','resolved')),
  resolved_at       timestamptz,
  remarks           text,
  created_at        timestamptz default now()
);

-- 6. ANNOUNCEMENTS
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  type       text not null default 'info' check (type in ('info','warning','success')),
  active     boolean default true,
  created_at timestamptz default now()
);

-- 7. TIMETABLE
create table if not exists timetable (
  id               uuid primary key default gen_random_uuid(),
  route_no         text not null references routes(route_no) on delete cascade,
  departure_time   text not null,
  arrival_time     text not null,
  days_of_operation text not null default 'All Days',
  created_at       timestamptz default now()
);

-- ══════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY (open read for demo)
-- ══════════════════════════════════════════════════
alter table routes          enable row level security;
alter table bus_stops       enable row level security;
alter table buses           enable row level security;
alter table epasses         enable row level security;
alter table breakdown_cases enable row level security;
alter table announcements   enable row level security;
alter table timetable       enable row level security;

-- Public read policies
create policy "public_read_routes"       on routes          for select using (true);
create policy "public_read_stops"        on bus_stops       for select using (true);
create policy "public_read_buses"        on buses           for select using (true);
create policy "public_read_epasses"      on epasses         for select using (true);
create policy "public_read_breakdowns"   on breakdown_cases for select using (true);
create policy "public_read_announcements" on announcements  for select using (true);
create policy "public_read_timetable"    on timetable       for select using (true);

-- Public insert policies (for ePass registration from passenger app)
create policy "public_insert_epass" on epasses for insert with check (true);

-- Public update for buses (position updates) and epasses (approval from portal)
create policy "public_update_buses"   on buses   for update using (true);
create policy "public_update_epasses" on epasses for update using (true);
create policy "public_insert_breakdown" on breakdown_cases for insert with check (true);
create policy "public_update_breakdown" on breakdown_cases for update using (true);
