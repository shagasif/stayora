-- Stayora schema. Run once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists hotels(
  id uuid primary key default gen_random_uuid(),
  name text not null, city text not null, country text not null,
  description text not null,
  stars int not null check (stars between 1 and 5),
  amenities text[] not null default '{}',
  hue int not null default 200,
  created_at timestamptz not null default now());

create table if not exists room_types(
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  name text not null,
  price_per_night numeric(10,2) not null check (price_per_night > 0),
  max_guests int not null check (max_guests > 0),
  rooms_total int not null check (rooms_total > 0));

create table if not exists guests(
  id uuid primary key default gen_random_uuid(),
  full_name text not null, email text not null, phone text,
  created_at timestamptz not null default now());

create table if not exists bookings(
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  guest_id uuid not null references guests(id),
  hotel_id uuid not null references hotels(id),
  room_type_id uuid not null references room_types(id),
  check_in date not null, check_out date not null,
  guest_count int not null check (guest_count > 0),
  rooms int not null default 1 check (rooms > 0),
  children int not null default 0 check (children >= 0),
  pets boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  total_price numeric(10,2) not null,
  status text not null default 'confirmed' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now(),
  check (check_out > check_in));
-- existing installs: add the new columns (safe to re-run)
alter table bookings add column if not exists rooms int not null default 1 check (rooms > 0);
alter table bookings add column if not exists children int not null default 0 check (children >= 0);
alter table bookings add column if not exists pets boolean not null default false;
alter table bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists bookings_user on bookings(user_id);
create index if not exists bookings_room_dates on bookings(room_type_id, check_in, check_out);

-- Earlier versions of this script inserted the demo room types again on every run. Remove unused copies, then prevent it.
delete from room_types a using room_types b
 where a.hotel_id = b.hotel_id and a.name = b.name and a.id <> b.id
   and not exists (select 1 from bookings x where x.room_type_id = a.id)
   and (a.ctid > b.ctid or exists (select 1 from bookings y where y.room_type_id = b.id));
create unique index if not exists room_types_hotel_name on room_types(hotel_id, name);

-- Security: public can read the catalogue only. guests/bookings have RLS on and no policies.
alter table hotels enable row level security;
alter table room_types enable row level security;
alter table guests enable row level security;
alter table bookings enable row level security;
drop policy if exists "read hotels" on hotels;
drop policy if exists "read rooms" on room_types;
create policy "read hotels" on hotels for select to anon, authenticated using (true);
create policy "read rooms" on room_types for select to anon, authenticated using (true);

-- Accounts: one profile row per signed-up user (email and password live in Supabase Auth: Authentication > Users)
create table if not exists profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text,
  created_at timestamptz not null default now());
alter table profiles enable row level security;
drop policy if exists "read own profile" on profiles;
drop policy if exists "update own profile" on profiles;
create policy "read own profile" on profiles for select to authenticated using (auth.uid() = id);
create policy "update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'phone'), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Functions changed (new inputs and outputs), so drop the old versions first. Safe to re-run.
drop function if exists search_hotels(text,date,date,int,uuid);
drop function if exists search_hotels(text,date,date,int,uuid,int);
drop function if exists create_booking(uuid,date,date,int,text,text,text);
drop function if exists create_booking(uuid,date,date,int,text,text,text,int,int,boolean);
drop function if exists get_booking(text,text);
drop function if exists my_bookings();

-- Search with live availability. p_guests = total guests, p_rooms = rooms wanted.
-- A room type qualifies when guests per room fit and enough rooms are free for every night.
create or replace function search_hotels(p_dest text default '', p_in date default null, p_out date default null, p_guests int default 1, p_hotel uuid default null, p_rooms int default 1)
returns table(hotel_id uuid, name text, city text, country text, description text, stars int, amenities text[], hue int, room_id uuid, room_name text, price numeric, max_guests int, available int)
language sql stable security definer set search_path = public as $$
  select h.id, h.name, h.city, h.country, h.description, h.stars, h.amenities, h.hue,
         r.id, r.name, r.price_per_night, r.max_guests, r.rooms_total - u.c
  from hotels h
  join room_types r on r.hotel_id = h.id
  cross join lateral (select coalesce(sum(b.rooms), 0)::int c from bookings b
     where b.room_type_id = r.id and b.status <> 'cancelled' and b.check_in < p_out and b.check_out > p_in) u
  where (p_hotel is null or h.id = p_hotel)
    and (coalesce(p_dest,'') = '' or h.city ilike '%'||p_dest||'%' or h.country ilike '%'||p_dest||'%' or h.name ilike '%'||p_dest||'%')
    and r.max_guests >= ceil(p_guests::numeric / greatest(coalesce(p_rooms,1), 1))
    and r.rooms_total - u.c >= greatest(coalesce(p_rooms,1), 1)
  order by h.stars desc, r.price_per_night
$$;

-- Create guest + booking atomically, re-checking availability under a row lock
create or replace function create_booking(p_room uuid, p_in date, p_out date, p_guests int, p_name text, p_email text, p_phone text, p_rooms int default 1, p_children int default 0, p_pets boolean default false)
returns table(reference text, status text, hotel_name text, city text, room_name text, check_in date, check_out date, guest_count int, rooms int, children int, pets boolean, total_price numeric, full_name text, email text)
language plpgsql security definer set search_path = public as $$
declare r room_types%rowtype; h hotels%rowtype; used int; gid uuid; ref text; tot numeric;
        nr int := greatest(coalesce(p_rooms, 1), 1); ch int := coalesce(p_children, 0);
begin
  if p_in is null or p_out is null or p_in < current_date or p_out <= p_in then raise exception 'Choose valid dates: check-in today or later, check-out after check-in.'; end if;
  if p_out - p_in > 30 then raise exception 'Stays are limited to 30 nights.'; end if;
  if coalesce(trim(p_name),'') = '' or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter your full name and a valid email address.'; end if;
  if p_guests < 1 or p_guests > 16 or ch < 0 or ch >= p_guests then raise exception 'Choose 1 to 16 guests with at least one adult.'; end if;
  if nr > 5 then raise exception 'You can book up to 5 rooms at a time.'; end if;
  if nr > p_guests - ch then raise exception 'Each room needs at least one adult.'; end if;
  select * into r from room_types where id = p_room for update;
  if not found then raise exception 'That room could not be found.'; end if;
  if ceil(p_guests::numeric / nr) > r.max_guests then raise exception 'This room sleeps up to % guests. Add rooms or choose a larger room.', r.max_guests; end if;
  select coalesce(sum(b.rooms), 0) into used from bookings b where b.room_type_id = r.id and b.status <> 'cancelled' and b.check_in < p_out and b.check_out > p_in;
  if r.rooms_total - used < nr then raise exception 'Not enough rooms left for those dates. Please pick other dates or another room.'; end if;
  select * into h from hotels where id = r.hotel_id;
  tot := (p_out - p_in) * r.price_per_night * nr;
  insert into guests(full_name, email, phone) values (trim(p_name), lower(trim(p_email)), nullif(trim(p_phone),'')) returning id into gid;
  ref := 'STY-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  insert into bookings(reference, guest_id, hotel_id, room_type_id, check_in, check_out, guest_count, rooms, children, pets, total_price, status, user_id)
    values (ref, gid, h.id, r.id, p_in, p_out, p_guests, nr, ch, coalesce(p_pets, false), tot, 'confirmed', auth.uid());
  return query select ref, 'confirmed'::text, h.name, h.city, r.name, p_in, p_out, p_guests, nr, ch, coalesce(p_pets, false), tot, trim(p_name), lower(trim(p_email));
end $$;

-- Look up a booking: needs reference AND the email used to book
create or replace function get_booking(p_ref text, p_email text)
returns table(reference text, status text, hotel_name text, city text, room_name text, check_in date, check_out date, guest_count int, rooms int, children int, pets boolean, total_price numeric, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select b.reference, b.status, h.name, h.city, r.name, b.check_in, b.check_out, b.guest_count, b.rooms, b.children, b.pets, b.total_price, g.full_name, g.email
  from bookings b join hotels h on h.id = b.hotel_id join room_types r on r.id = b.room_type_id join guests g on g.id = b.guest_id
  where b.reference = upper(trim(p_ref)) and g.email = lower(trim(p_email))
$$;

-- The signed-in user's own bookings (newest first)
create or replace function my_bookings()
returns table(reference text, status text, hotel_name text, city text, room_name text, check_in date, check_out date, guest_count int, rooms int, children int, pets boolean, total_price numeric, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select b.reference, b.status, h.name, h.city, r.name, b.check_in, b.check_out, b.guest_count, b.rooms, b.children, b.pets, b.total_price, g.full_name, g.email
  from bookings b join hotels h on h.id = b.hotel_id join room_types r on r.id = b.room_type_id join guests g on g.id = b.guest_id
  where b.user_id = auth.uid()
  order by b.created_at desc
$$;

grant execute on function search_hotels(text,date,date,int,uuid,int) to anon, authenticated;
grant execute on function create_booking(uuid,date,date,int,text,text,text,int,int,boolean) to anon, authenticated;
grant execute on function get_booking(text,text) to anon, authenticated;
grant execute on function my_bookings() to authenticated;

-- Demo data: FICTIONAL hotels (safe to delete and replace)
insert into hotels(id,name,city,country,description,stars,amenities,hue) values
('a0000000-0000-0000-0000-000000000001','The Saffron Terrace','Lisbon','Portugal','Demo listing. A hillside hotel with a rooftop terrace and tiled courtyard.',4,'{Free Wi-Fi,Rooftop terrace,Breakfast,Air conditioning}',28),
('a0000000-0000-0000-0000-000000000002','Marina Lumen Hotel','Dubai','United Arab Emirates','Demo listing. A waterfront tower with an infinity pool and skyline rooms.',5,'{Free Wi-Fi,Pool,Spa,Gym,Airport shuttle}',195),
('a0000000-0000-0000-0000-000000000003','Bosphorus Lantern House','Istanbul','Turkey','Demo listing. A small boutique stay with strait views and a garden breakfast room.',4,'{Free Wi-Fi,Breakfast,Garden,Air conditioning}',12),
('a0000000-0000-0000-0000-000000000004','Kyoto Willow Inn','Kyoto','Japan','Demo listing. A quiet inn with tatami rooms and a small tea garden.',3,'{Free Wi-Fi,Tea garden,Breakfast}',140),
('a0000000-0000-0000-0000-000000000005','Alpine Ember Lodge','Interlaken','Switzerland','Demo listing. A timber lodge with mountain views and a fireside lounge.',4,'{Free Wi-Fi,Sauna,Fireplace,Parking}',215),
('a0000000-0000-0000-0000-000000000006','Seaglass Villas','Ubud','Indonesia','Demo listing. Private villas set among rice terraces, each with a plunge pool.',5,'{Free Wi-Fi,Private pool,Breakfast,Yoga deck}',95),
('a0000000-0000-0000-0000-000000000007','Clifton Sands Hotel','Karachi','Pakistan','Demo listing. A seafront hotel a short walk from the beach, with a pool and a rooftop restaurant.',4,'{Free Wi-Fi,Pool,Rooftop restaurant,Air conditioning}',205),
('a0000000-0000-0000-0000-000000000008','Mughal Courtyard Hotel','Lahore','Pakistan','Demo listing. A restored courtyard hotel near the old city, with carved wooden balconies and a garden dining area.',4,'{Free Wi-Fi,Courtyard garden,Breakfast,Air conditioning}',25),
('a0000000-0000-0000-0000-000000000009','Margalla View Suites','Islamabad','Pakistan','Demo listing. Modern suites with hill views, a spa and a business lounge in a quiet, leafy sector.',5,'{Free Wi-Fi,Spa,Gym,Airport shuttle,Business lounge}',150),
('a0000000-0000-0000-0000-000000000010','Karimabad Orchard Lodge','Hunza','Pakistan','Demo listing. A stone-and-timber lodge among apricot orchards, with mountain views from every room.',4,'{Free Wi-Fi,Orchard garden,Breakfast,Mountain views}',100),
('a0000000-0000-0000-0000-000000000011','Indus Lakeside Retreat','Skardu','Pakistan','Demo listing. A lakeside retreat with a fireplace lounge and a guided-trek desk.',4,'{Free Wi-Fi,Fireplace,Breakfast,Tour desk}',190),
('a0000000-0000-0000-0000-000000000012','Pine Ridge Cottage Hotel','Murree','Pakistan','Demo listing. A cosy hill hotel among pine trees, with a terrace and warm rooms.',3,'{Free Wi-Fi,Terrace,Breakfast,Heating}',130),
('a0000000-0000-0000-0000-000000000013','Swat River Inn','Swat','Pakistan','Demo listing. A riverside inn with a garden restaurant and simple, comfortable rooms.',3,'{Free Wi-Fi,Garden restaurant,Breakfast,Parking}',170),
('a0000000-0000-0000-0000-000000000014','Khyber Courtyard Inn','Peshawar','Pakistan','Demo listing. A small inn in a traditional courtyard house, close to the old bazaars.',3,'{Free Wi-Fi,Courtyard,Breakfast,Air conditioning}',15),
('a0000000-0000-0000-0000-000000000015','Sufi Gate Hotel','Multan','Pakistan','Demo listing. A friendly city hotel decorated with blue tilework, with a rooftop terrace.',3,'{Free Wi-Fi,Rooftop terrace,Breakfast,Air conditioning}',45),
('a0000000-0000-0000-0000-000000000016','Gwadar Bay Resort','Gwadar','Pakistan','Demo listing. A beachfront resort on the bay, with a lagoon-style pool and a seafood restaurant.',4,'{Free Wi-Fi,Private beach,Pool,Seafood restaurant}',185)
on conflict (id) do nothing;

insert into room_types(hotel_id,name,price_per_night,max_guests,rooms_total) values
('a0000000-0000-0000-0000-000000000001','Classic Double',118,2,6),('a0000000-0000-0000-0000-000000000001','Terrace Suite',189,4,2),
('a0000000-0000-0000-0000-000000000002','Skyline King',265,2,8),('a0000000-0000-0000-0000-000000000002','Marina Family Suite',410,4,3),
('a0000000-0000-0000-0000-000000000003','Garden Double',104,2,5),('a0000000-0000-0000-0000-000000000003','Strait View Suite',172,3,2),
('a0000000-0000-0000-0000-000000000004','Tatami Twin',92,2,4),('a0000000-0000-0000-0000-000000000004','Family Tatami',138,4,2),
('a0000000-0000-0000-0000-000000000005','Lodge Double',150,2,6),('a0000000-0000-0000-0000-000000000005','Mountain Family Room',238,4,3),
('a0000000-0000-0000-0000-000000000006','Terrace Villa',220,2,4),('a0000000-0000-0000-0000-000000000006','Two-bed Pool Villa',360,4,2),
('a0000000-0000-0000-0000-000000000007','Classic Double',85,2,8),('a0000000-0000-0000-0000-000000000007','Sea View Suite',140,4,3),
('a0000000-0000-0000-0000-000000000008','Heritage Double',78,2,6),('a0000000-0000-0000-0000-000000000008','Courtyard Suite',130,3,3),
('a0000000-0000-0000-0000-000000000009','Deluxe King',120,2,8),('a0000000-0000-0000-0000-000000000009','Executive Family Suite',210,4,3),
('a0000000-0000-0000-0000-000000000010','Valley Double',70,2,6),('a0000000-0000-0000-0000-000000000010','Family Cabin',115,4,3),
('a0000000-0000-0000-0000-000000000011','Lake Double',75,2,5),('a0000000-0000-0000-0000-000000000011','Lakeside Family Room',125,4,2),
('a0000000-0000-0000-0000-000000000012','Cosy Double',55,2,6),('a0000000-0000-0000-0000-000000000012','Hill Family Room',90,4,3),
('a0000000-0000-0000-0000-000000000013','River Double',50,2,6),('a0000000-0000-0000-0000-000000000013','Garden Family Room',85,4,2),
('a0000000-0000-0000-0000-000000000014','Standard Double',48,2,5),('a0000000-0000-0000-0000-000000000014','Courtyard Suite',82,3,2),
('a0000000-0000-0000-0000-000000000015','Blue Tile Double',52,2,6),('a0000000-0000-0000-0000-000000000015','Family Suite',92,4,3),
('a0000000-0000-0000-0000-000000000016','Bay View Double',95,2,6),('a0000000-0000-0000-0000-000000000016','Beach Villa',170,4,3),
('a0000000-0000-0000-0000-000000000007','Large Family Room',165,6,2),('a0000000-0000-0000-0000-000000000008','Large Family Room',150,6,2),
('a0000000-0000-0000-0000-000000000009','Large Family Room',280,6,2),('a0000000-0000-0000-0000-000000000010','Large Family Room',140,6,2),
('a0000000-0000-0000-0000-000000000011','Large Family Room',145,6,2),('a0000000-0000-0000-0000-000000000012','Large Family Room',110,6,2),
('a0000000-0000-0000-0000-000000000013','Large Family Room',100,6,2),('a0000000-0000-0000-0000-000000000014','Large Family Room',95,6,2),
('a0000000-0000-0000-0000-000000000015','Large Family Room',105,6,2),('a0000000-0000-0000-0000-000000000016','Large Family Room',190,6,2)
on conflict (hotel_id, name) do nothing;

-- The Lahore and Peshawar suites now sleep 4 (safe to re-run)
update room_types set max_guests = 4 where name = 'Courtyard Suite' and max_guests = 3 and hotel_id in ('a0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000014');
