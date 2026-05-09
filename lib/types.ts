export type BusStatus = 'running' | 'delayed' | 'depot' | 'breakdown'
export type PassType = 'daily' | 'monthly' | 'student' | 'senior'
export type PassStatus = 'active' | 'pending' | 'rejected' | 'expired'
export type BusType = 'city_ordinary' | 'metro_express' | 'metro_luxury'
export type Language = 'en' | 'te' | 'hi'

export interface Stop {
  id: string
  name: string
  route_no: string
  stop_index: number
  city: string
  district: string
  landmark: string
  latitude: number
  longitude: number
}

export interface Route {
  id: string
  route_no: string
  route_name: string
  from_stop: string
  to_stop: string
  bus_type: BusType
  ac: boolean
  depot: string
  capacity: number
  fleet_size: number
  distance_km: number
  duration_mins: number
  first_departure: string
  last_departure: string
}

export interface Bus {
  id: string
  registration: string
  route_no: string
  route_name: string
  from_stop: string
  to_stop: string
  bus_type: BusType
  ac: boolean
  depot: string
  capacity: number
  status: BusStatus
  current_stop_index: number
  seats_occupied: number
  departure_time: string
  arrival_time: string
  driver_name: string
  driver_mobile: string
  delay_mins: number
}

export interface BusStop {
  name: string
  time: string
  state: 'passed' | 'current' | 'upcoming'
  is_boarding?: boolean
  is_destination?: boolean
}

export interface EPass {
  id: string
  pass_id: string
  holder_name: string
  aadhaar_last4: string
  mobile: string
  pass_type: PassType
  route: string
  cfms_id?: string
  org_name?: string
  payment_method: string
  amount: number
  status: PassStatus
  valid_from: string
  valid_until: string
  auto_renewal: boolean
  created_at: string
}

export interface BreakdownCase {
  id: string
  bus_id: string
  route_no: string
  location: string
  reported_at: string
  issue_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  passengers_on_board: number
  recovery_sent: boolean
  status: 'open' | 'under_recovery' | 'resolved'
  resolved_at?: string
  remarks: string
}

export interface Announcement {
  id: string
  message: string
  type: 'info' | 'warning' | 'success'
  active: boolean
  created_at: string
}

export interface Timetable {
  id: string
  route_no: string
  route_name: string
  from_stop: string
  to_stop: string
  departure_time: string
  arrival_time: string
  bus_type: BusType
  depot: string
  days_of_operation: string
}
