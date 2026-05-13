import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import StatusBar from './StatusBar'
interface Route {
  route_no: string
  route_name: string
  from_stop: string
  to_stop: string
  bus_type: string
  ac: boolean
  depot: string
  capacity: number
  fleet_size: number
  distance_km: number
  duration_mins: number
  first_departure: string
  last_departure: string
}

interface TimetableRow {
  id: string
  route_no: string
  departure_time: string
  arrival_time: string
  days_of_operation: string
}

const BUS_TYPE_LABELS: Record<string, string> = {
  city_ordinary: 'City Ordinary',
  metro_express: 'Metro Express',
  metro_luxury: 'Metro Luxury',
}

const BUS_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  city_ordinary: { bg: '#EBF2FF', color: '#1B3A6B' },
  metro_express: { bg: '#FFF8E1', color: '#854F0B' },
  metro_luxury:  { bg: '#E8F5E9', color: '#1A7A4A' },
}

function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export default function Timetable() {
  const { t } = useLang()
  const nav = useNavigate()

  const [routes, setRoutes]         = useState<Route[]>([])
  const [schedule, setSchedule]     = useState<TimetableRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [depotFilter, setDepotFilter] = useState('all')
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [depots, setDepots]         = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: rData } = await supabase
        .from('routes')
        .select('*')
        .order('route_no', { ascending: true })

      const { data: sData } = await supabase
        .from('timetable')
        .select('*')
        .order('departure_time', { ascending: true })

      if (rData) {
        setRoutes(rData)
        const uniqueDepots = [...new Set(rData.map(r => r.depot))].sort()
        setDepots(uniqueDepots)
      }
      if (sData) setSchedule(sData)
      setLoading(false)
    }
    load()
  }, [])

  // Filter routes
  const filtered = routes.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.route_no.toLowerCase().includes(q) ||
      r.from_stop.toLowerCase().includes(q) ||
      r.to_stop.toLowerCase().includes(q) ||
      r.depot.toLowerCase().includes(q)
    const matchType  = typeFilter === 'all' || r.bus_type === typeFilter
    const matchDepot = depotFilter === 'all' || r.depot === depotFilter
    return matchSearch && matchType && matchDepot
  })

  // Get schedule for selected route
  const routeSchedule = selectedRoute
    ? schedule.filter(s => s.route_no === selectedRoute.route_no)
    : []

  // ── Schedule Detail View ────────────────────────────────────────────────────
  if (selectedRoute) {
    const colors = BUS_TYPE_COLORS[selectedRoute.bus_type] || BUS_TYPE_COLORS.city_ordinary
    return (
      <div className="phone-shell">
        <div className="status-bar">
         <StatusBar />
        </div>

        {/* Header */}
        <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button onClick={() => setSelectedRoute(null)} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: 'white', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: 'white' }}>
                Route {selectedRoute.route_no}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                {selectedRoute.from_stop} → {selectedRoute.to_stop}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ ...colors, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
              {BUS_TYPE_LABELS[selectedRoute.bus_type]}
            </div>
            <div style={{ background: 'var(--light)', color: 'var(--blue)', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
              🏭 {selectedRoute.depot}
            </div>
            <div style={{ background: '#E8F5E9', color: '#1A7A4A', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
              {minsToHHMM(selectedRoute.duration_mins)}
            </div>
            <div style={{ background: '#F3F4F6', color: 'var(--mute)', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
              {selectedRoute.distance_km} km
            </div>
          </div>
        </div>

        <div className="scrollable">

          {/* Route summary card */}
          <div style={{ background: 'white', margin: 14, borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Fleet Size',       value: `${selectedRoute.fleet_size} buses` },
                { label: 'Capacity',         value: `${selectedRoute.capacity} seats` },
                { label: 'First Departure',  value: selectedRoute.first_departure },
                { label: 'Last Departure',   value: selectedRoute.last_departure },
                { label: 'AC Service',       value: selectedRoute.ac ? '✓ Yes' : '✗ No' },
                { label: 'Daily Trips',      value: `${routeSchedule.length} trips` },
              ].map((item, i) => (
                <div key={i} style={{ padding: '8px 10px', background: 'var(--gray)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--mute)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick action */}
          <div style={{ padding: '0 14px 14px' }}>
            <button className="btn-primary"
              onClick={() => nav(`/bus/${selectedRoute.route_no}`)}>
              🚌 Track This Bus Live
            </button>
          </div>

          {/* Full timetable */}
          <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F0F4FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Full Daily Schedule
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                {routeSchedule.length} trips
              </div>
            </div>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', background: 'var(--blue)', padding: '8px 14px' }}>
              {['Departure', 'Arrival', 'Days'].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>{h}</div>
              ))}
            </div>

            {routeSchedule.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
                Schedule data coming soon
              </div>
            ) : (
              routeSchedule.map((trip, i) => {
                const now = new Date()
                const [h, m] = trip.departure_time.split(':').map(Number)
                const depTime = new Date()
                depTime.setHours(h, m, 0, 0)
                const isPast = depTime < now
                const isNext = !isPast && routeSchedule.slice(0, i).every(t => {
                  const [th, tm] = t.departure_time.split(':').map(Number)
                  const td = new Date(); td.setHours(th, tm, 0, 0)
                  return td < now
                })

                return (
                  <div key={trip.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr',
                    padding: '10px 14px',
                    background: isNext ? '#EBF2FF' : i % 2 === 0 ? 'white' : 'var(--gray)',
                    borderBottom: '1px solid #F0F4FA',
                    borderLeft: isNext ? '3px solid var(--blue)' : '3px solid transparent',
                  }}>
                    <div style={{
                      fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 700,
                      color: isPast ? 'var(--mute)' : isNext ? 'var(--blue)' : 'var(--text)',
                    }}>
                      {trip.departure_time}
                      {isNext && <span style={{ fontSize: 9, background: 'var(--blue)', color: 'white', padding: '1px 5px', borderRadius: 8, marginLeft: 4, fontFamily: 'Inter,sans-serif', fontWeight: 700 }}>NEXT</span>}
                    </div>
                    <div style={{
                      fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 600,
                      color: isPast ? 'var(--mute)' : 'var(--text)',
                    }}>
                      {trip.arrival_time}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mute)', alignSelf: 'center' }}>
                      {trip.days_of_operation}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ height: 20 }} />
        </div>
      </div>
    )
  }

  // ── Main Timetable List View ────────────────────────────────────────────────
  return (
    <div className="phone-shell">
      <div className="status-bar">
       <StatusBar />
      </div>

      {/* Header */}
      <div style={{ background: 'var(--blue)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={() => nav('/')} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: 'white', fontSize: 16, cursor: 'pointer',
          }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'white' }}>
              {t('timetable')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {filtered.length} routes · Visakhapatnam
            </div>
          </div>
        </div>

        {/* Search bar */}
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search route number, stop or depot..."
          style={{ background: 'rgba(255,255,255,0.95)', marginBottom: 8 }}
        />

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 20, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: 'white',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            <option value="all" style={{ color: 'var(--text)' }}>All Types</option>
            <option value="city_ordinary" style={{ color: 'var(--text)' }}>City Ordinary</option>
            <option value="metro_express" style={{ color: 'var(--text)' }}>Metro Express</option>
            <option value="metro_luxury" style={{ color: 'var(--text)' }}>Metro Luxury</option>
          </select>

          <select
            value={depotFilter}
            onChange={e => setDepotFilter(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 20, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: 'white',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', flex: 1,
            }}>
            <option value="all" style={{ color: 'var(--text)' }}>All Depots</option>
            {depots.map(d => (
              <option key={d} value={d} style={{ color: 'var(--text)' }}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Route list */}
      <div className="scrollable">

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontSize: 14 }}>
            Loading timetable...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⏰</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No routes found</div>
            <div style={{ fontSize: 13, color: 'var(--mute)' }}>Try a different search or filter</div>
          </div>
        )}

        {!loading && filtered.map((route, idx) => {
          const colors = BUS_TYPE_COLORS[route.bus_type] || BUS_TYPE_COLORS.city_ordinary
          const tripCount = schedule.filter(s => s.route_no === route.route_no).length

          return (
            <div key={route.route_no}
              onClick={() => setSelectedRoute(route)}
              style={{
                background: 'white', margin: idx === 0 ? '12px 14px 8px' : '0 14px 8px',
                borderRadius: 12, boxShadow: 'var(--shadow)',
                overflow: 'hidden', cursor: 'pointer',
                border: '1.5px solid transparent', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>

              {/* Card top */}
              <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Route number */}
                <div style={{
                  background: 'var(--blue)', color: 'white',
                  fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 700,
                  padding: '4px 10px', borderRadius: 8, minWidth: 52, textAlign: 'center',
                  flexShrink: 0,
                }}>{route.route_no}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {route.from_stop} → {route.to_stop}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                    🏭 {route.depot}
                  </div>
                </div>

                <div style={{ ...colors, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                  {BUS_TYPE_LABELS[route.bus_type]}
                </div>
              </div>

              {/* Card bottom */}
              <div style={{ padding: '8px 14px 10px', background: 'var(--gray)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--mute)' }}>First bus</div>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      {route.first_departure}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--mute)' }}>Last bus</div>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      {route.last_departure}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--mute)' }}>Trips/day</div>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>
                      {tripCount || route.fleet_size * 3}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>
                    {route.fleet_size} buses · {minsToHHMM(route.duration_mins)}
                  </div>
                  <span style={{ color: 'var(--blue)', fontWeight: 700 }}>›</span>
                </div>
              </div>
            </div>
          )
        })}

        <div style={{ height: 20 }} />
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {[
          { icon: '🏠', label: t('home'),      path: '/' },
          { icon: '🚌', label: t('buses'),     path: '/buses' },
          { icon: '🪪', label: t('epass'),     path: '/epass' },
          { icon: '⏰', label: t('timetable'), path: '/timetable' },
          { icon: '👤', label: t('profile'),   path: '/profile' },
        ].map((item, i) => (
          <button key={i}
            className={`nav-item${window.location.pathname === item.path ? ' active' : ''}`}
            onClick={() => nav(item.path)}>
            <div className="nav-icon">{item.icon}</div>
            {window.location.pathname === item.path && <div className="nav-dot" />}
            <div className="nav-label"
              style={window.location.pathname === item.path ? { color: 'var(--blue)' } : {}}>
              {item.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
