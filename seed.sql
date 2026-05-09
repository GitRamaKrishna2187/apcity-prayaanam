-- ══════════════════════════════════════════════════
-- APCityPrayaanam — Seed Data
-- Run AFTER schema.sql in Supabase SQL Editor
-- ══════════════════════════════════════════════════

-- ROUTES (10 key Vizag routes)
insert into routes (route_no,route_name,from_stop,to_stop,bus_type,ac,depot,capacity,fleet_size,distance_km,duration_mins,first_departure,last_departure) values
('900R','RTC Complex – Rushikonda','RTC Complex','Rushikonda','metro_express',false,'Madhurawada',44,5,18,50,'05:00','21:30'),
('400','RTC Complex – Gajuwaka','RTC Complex','Gajuwaka','city_ordinary',false,'Gajuwaka',60,8,22,65,'04:30','22:00'),
('38J','Bheemunipatnam – Steel Plant','Bheemunipatnam','Steel Plant','metro_express',false,'Waltair',44,11,38,90,'05:15','20:45'),
('10K','RTC Complex – Maddilapalem','RTC Complex','Maddilapalem','city_ordinary',false,'Maddilapalem',60,6,12,35,'05:00','22:30'),
('60R','Simhachalam – MVP Colony','Simhachalam','MVP Colony','metro_luxury',true,'Simhachalam',40,4,14,40,'06:00','21:00'),
('500P','RTC Complex – Pendurthi','RTC Complex','Pendurthi','city_ordinary',false,'Madhurawada',60,7,28,75,'04:45','21:15'),
('99K','RTC Complex – Kommadi','RTC Complex','Kommadi','metro_express',false,'Madhurawada',44,5,20,55,'05:30','21:00'),
('6H','Gajuwaka – MVP Colony','Gajuwaka','MVP Colony','city_ordinary',false,'Gajuwaka',60,9,16,45,'05:00','22:00'),
('22C','RTC Complex – Airport','RTC Complex','Airport','metro_luxury',true,'Waltair',40,3,25,60,'05:00','20:00'),
('15D','Simhachalam – Gajuwaka','Simhachalam','Gajuwaka','city_ordinary',false,'Simhachalam',60,6,30,80,'05:15','21:30')
on conflict (route_no) do nothing;

-- BUS STOPS for Route 900R
insert into bus_stops (stop_name,route_no,stop_index,city,landmark,latitude,longitude) values
('RTC Complex','900R',1,'Visakhapatnam','Main Bus Terminal',17.6868,83.2185),
('INS Kalinga','900R',2,'Visakhapatnam','Navy Gate',17.7126,83.2856),
('Sagar Nagar','900R',3,'Visakhapatnam','Sagar Nagar Junction',17.7284,83.3047),
('MVP Colony','900R',4,'Visakhapatnam','MVP Colony Centre',17.7326,83.3215),
('Rushikonda','900R',5,'Visakhapatnam','Rushikonda Beach',17.7676,83.3693)
on conflict (route_no,stop_index) do nothing;

-- BUS STOPS for Route 400
insert into bus_stops (stop_name,route_no,stop_index,city,landmark,latitude,longitude) values
('RTC Complex','400',1,'Visakhapatnam','Main Bus Terminal',17.6868,83.2185),
('Jagadamba Junction','400',2,'Visakhapatnam','Jagadamba Centre',17.6987,83.2298),
('Dwaraka Nagar','400',3,'Visakhapatnam','Dwaraka Nagar Bus Stop',17.7043,83.2334),
('Seethammadhara','400',4,'Visakhapatnam','Seethammadhara Circle',17.7215,83.2456),
('Kommadi','400',5,'Visakhapatnam','Kommadi Junction',17.7534,83.2876),
('Auto Nagar','400',6,'Visakhapatnam','Auto Nagar Gate',17.7823,83.3124),
('Gajuwaka','400',7,'Visakhapatnam','Gajuwaka Bus Stand',17.8134,83.3456)
on conflict (route_no,stop_index) do nothing;

-- BUS STOPS for Route 60R
insert into bus_stops (stop_name,route_no,stop_index,city,landmark,latitude,longitude) values
('Simhachalam Hills','60R',1,'Visakhapatnam','Simhachalam Temple',17.7668,83.2456),
('Arilova','60R',2,'Visakhapatnam','Arilova Junction',17.7534,83.2598),
('Maddilapalem','60R',3,'Visakhapatnam','Maddilapalem Bus Stop',17.7423,83.2712),
('MVP Colony','60R',4,'Visakhapatnam','MVP Colony Centre',17.7326,83.3215)
on conflict (route_no,stop_index) do nothing;

-- BUS STOPS for Route 22C (Airport)
insert into bus_stops (stop_name,route_no,stop_index,city,landmark,latitude,longitude) values
('RTC Complex','22C',1,'Visakhapatnam','Main Bus Terminal',17.6868,83.2185),
('Dwaraka Nagar','22C',2,'Visakhapatnam','Dwaraka Nagar',17.7043,83.2334),
('NAD Junction','22C',3,'Visakhapatnam','NAD Circle',17.7215,83.2512),
('Gopalapatnam','22C',4,'Visakhapatnam','Gopalapatnam Bus Stop',17.7512,83.2698),
('Bheemulipatnam Rd','22C',5,'Visakhapatnam','NH-16 Airport Turn',17.7876,83.2934),
('Visakhapatnam Airport','22C',6,'Visakhapatnam','VTZ Airport',17.7213,83.2245)
on conflict (route_no,stop_index) do nothing;

-- BUSES for 900R
insert into buses (registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,driver_mobile,delay_mins) values
('AP 31 U 1000','900R','running',3,31,'05:00','05:50','K. Venkateswara Rao','9848012345',0),
('AP 31 V 6656','900R','running',2,18,'05:30','06:20','P. Suresh','9848023456',0),
('AP 31 W 3192','900R','delayed',1,8,'06:00','06:50','M. Raju','9848034567',15),
('AP 31 Z 5872','900R','depot',1,0,'07:00','07:50','S. Nagaraju','9848045678',0),
('AP 31 AB 1234','900R','running',4,39,'07:30','08:20','T. Ramesh','9848056789',0)
on conflict (registration) do nothing;

-- BUSES for 400
insert into buses (registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,driver_mobile,delay_mins) values
('AP 31 U 2001','400','running',4,42,'05:00','06:05','G. Prasad','9848067890',0),
('AP 31 V 2002','400','running',2,28,'05:30','06:35','H. Kishore','9848078901',0),
('AP 31 W 2003','400','delayed',3,55,'06:00','07:05','J. Rao','9848089012',20),
('AP 31 X 2004','400','running',5,36,'06:30','07:35','K. Babu','9848090123',0),
('AP 31 Y 2005','400','depot',1,0,'07:00','08:05','L. Murthy','9848001234',0),
('AP 31 Z 2006','400','running',1,12,'07:30','08:35','M. Reddy','9848011235',0),
('AP 31 AA 2007','400','running',6,48,'08:00','09:05','N. Kumar','9848022346',0),
('AP 31 AB 2008','400','breakdown',3,35,'08:30','09:35','O. Srinivas','9848033457',0)
on conflict (registration) do nothing;

-- BUSES for 60R
insert into buses (registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,driver_mobile,delay_mins) values
('AP 31 U 6001','60R','running',2,28,'06:00','06:40','P. Subrahmanyam','9848044568',0),
('AP 31 V 6002','60R','running',1,15,'06:30','07:10','Q. Anand','9848055679',0),
('AP 31 W 6003','60R','delayed',3,34,'07:00','07:40','R. Vijay','9848066780',10),
('AP 31 X 6004','60R','depot',1,0,'07:30','08:10','S. Praveen','9848077891',0)
on conflict (registration) do nothing;

-- BUSES for 22C Airport
insert into buses (registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,driver_mobile,delay_mins) values
('AP 31 U 2201','22C','running',3,22,'05:00','06:00','T. Chandrasekhar','9848088902',0),
('AP 31 V 2202','22C','running',1,8,'06:00','07:00','U. Laxman','9848099013',0),
('AP 31 W 2203','22C','depot',1,0,'08:00','09:00','V. Srikanth','9848010124',0)
on conflict (registration) do nothing;

-- BREAKDOWN CASES
insert into breakdown_cases (incident_id,bus_registration,route_no,location,issue_type,severity,passengers_on_board,recovery_sent,status,remarks) values
('INC-2025-001','AP 31 AB 2008','400','Kommadi Junction, NH-16','Engine Overheating','medium',35,true,'under_recovery','Recovery vehicle dispatched from Gajuwaka depot'),
('INC-2025-002','AP 31 W 3192','900R','Sagar Nagar Bus Stop','Tyre Puncture','low',8,false,'resolved','Self-resolved after tyre change — 15 min delay')
on conflict (incident_id) do nothing;

-- ANNOUNCEMENTS
insert into announcements (message,type,active) values
('Visakha Utsav special services on Routes 900R and 500P — Apr 27 to Apr 30. Extra buses every 15 minutes.','info',true),
('Route 400 bus AP 31 AB 2008 breakdown at Kommadi. Alternative bus dispatched. ETA 20 mins.','warning',true),
('New Metro Luxury service launched on Route 22C — RTC Complex to Airport. Non-stop in 55 minutes.','success',true)
on conflict do nothing;

-- EPASS sample (your name)
insert into epasses (pass_id,holder_name,aadhaar_last4,mobile,pass_type,route,cfms_id,org_name,payment_method,amount,status,valid_from,valid_until,auto_renewal) values
('APTC-2025-VSP-0042891','BVASSR KRISHNA','6789','9848000001','monthly','Visakhapatnam — All Routes','CFMS-AP-9876543','AP Secretariat — Visakhapatnam','UPI Autopay',350,'active',current_date, current_date + interval '30 days',true)
on conflict (pass_id) do nothing;

-- TIMETABLE for 900R (sample departures)
insert into timetable (route_no,departure_time,arrival_time,days_of_operation) values
('900R','05:00','05:50','All Days'),
('900R','05:30','06:20','All Days'),
('900R','06:00','06:50','All Days'),
('900R','06:30','07:20','All Days'),
('900R','07:00','07:50','All Days'),
('900R','07:30','08:20','All Days'),
('900R','08:00','08:50','All Days'),
('900R','09:00','09:50','All Days'),
('900R','10:00','10:50','All Days'),
('900R','11:00','11:50','All Days'),
('900R','12:00','12:50','All Days'),
('900R','14:00','14:50','All Days'),
('900R','16:00','16:50','All Days'),
('900R','17:00','17:50','All Days'),
('900R','18:00','18:50','All Days'),
('900R','19:00','19:50','All Days'),
('900R','20:00','20:50','All Days'),
('900R','21:30','22:20','All Days')
on conflict do nothing;

-- TIMETABLE for 400
insert into timetable (route_no,departure_time,arrival_time,days_of_operation) values
('400','04:30','05:35','All Days'),
('400','05:00','06:05','All Days'),
('400','05:30','06:35','All Days'),
('400','06:00','07:05','All Days'),
('400','06:30','07:35','All Days'),
('400','07:00','08:05','All Days'),
('400','07:30','08:35','All Days'),
('400','08:00','09:05','All Days'),
('400','09:00','10:05','All Days'),
('400','10:00','11:05','All Days'),
('400','12:00','13:05','All Days'),
('400','14:00','15:05','All Days'),
('400','16:00','17:05','All Days'),
('400','17:00','18:05','All Days'),
('400','18:00','19:05','All Days'),
('400','19:00','20:05','All Days'),
('400','20:00','21:05','All Days'),
('400','21:00','22:05','All Days'),
('400','22:00','23:05','Weekdays Only')
on conflict do nothing;
