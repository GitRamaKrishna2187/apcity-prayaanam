import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import StatusBar from './StatusBar'

interface BusRow {
  id: string
  registration: string
  route_no: string
  status: string
  current_stop_index: number
  seats_occupied: number
  departure_time: string
  arrival_time: string
  driver_name: string
  delay_mins: number
}

interface RouteGroup {
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
  buses: BusRow[]
}

const BUS_TYPE_LABELS: Record<string, string> = {
  city_ordinary: 'City Ordinary',
  metro_express: 'Metro Express',
  metro_luxury:  'Metro Luxury',
}
const STATUS_COLORS: Record<string, string> = {
  running: '#1A7A4A', delayed: '#E65100', depot: '#7A8BA6', breakdown: '#C0392B',
}
const STATUS_BG: Record<string, string> = {
  running: '#E8F5E9', delayed: '#FFF3E0', depot: '#F3F4F6', breakdown: '#FDECEA', completed: '#F3F4F6',
}
const STATUS_COLORS_COMPLETED = '#9CA3AF'  // grey for completed

function occColor(pct: number) {
  if (pct >= 85) return '#C0392B'
  if (pct >= 60) return '#F5A623'
  return '#1A7A4A'
}
function occLabel(pct: number) {
  if (pct >= 85) return 'Almost Full'
  if (pct >= 60) return 'Filling Up'
  if (pct === 0) return 'Empty'
  return 'Available'
}
function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60
  if (h === 0) return `${m} min`
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// Current IST time in minutes since midnight
function nowISTMins(): number {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours() * 60 + ist.getMinutes()
}
function timeToMins(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Show bus if: mid-journey, departing within window, delayed, breakdown
// NEVER show completed trips (arrival time passed)
// window: 60 min for live view, 180 min for route search results
function isRelevantBus(bus: BusRow, windowMins = 60): boolean {
  const now = nowISTMins()
  const dep = timeToMins(bus.departure_time)
  const arr = timeToMins(bus.arrival_time)
  // Completed trip — exclude unless breakdown/delayed
  if (now > arr && bus.status !== 'delayed' && bus.status !== 'breakdown') return false
  if (dep <= now && now <= arr) return true               // mid-journey right now
  if (dep > now && dep - now <= windowMins) return true  // departing within window
  if (bus.status === 'delayed') return true
  if (bus.status === 'breakdown') return true
  return false
}

// Label for completed trips
function tripLabel(bus: BusRow): string {
  const now = nowISTMins()
  const arr = timeToMins(bus.arrival_time)
  if (now > arr && bus.status !== 'breakdown' && bus.status !== 'delayed') return 'COMPLETED'
  if (bus.status === 'running') return 'RUNNING'
  if (bus.status === 'delayed') return 'DELAYED'
  if (bus.status === 'breakdown') return 'BREAKDOWN'
  return departsIn(bus)
}

function departsIn(bus: BusRow): string {
  const now = nowISTMins()
  const dep = timeToMins(bus.departure_time)
  const arr = timeToMins(bus.arrival_time)
  if (now > arr && bus.status !== 'breakdown' && bus.status !== 'delayed') return 'Trip completed'
  if (dep <= now && now <= arr) return 'En Route'
  if (bus.status === 'delayed') return `Delayed ${bus.delay_mins || 0} min`
  const diff = dep - now
  if (diff <= 0) return 'En Route'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

// Fuzzy match: does stopName contain query?
function matchStop(stopName: string, query: string): boolean {
  if (!query || !stopName) return false
  const s = stopName.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (s.includes(q)) return true
  return s.split(/[\s,\-]+/).some(w => w.startsWith(q))
}

export default function Buses() {
  const { t } = useLang()
  const nav = useNavigate()
  const [params] = useSearchParams()

  const fromParam  = params.get('from')  || ''
  const toParam    = params.get('to')    || ''
  const routeParam = params.get('route') || ''

  const [groups, setGroups]           = useState<RouteGroup[]>([])
  const [loading, setLoading]         = useState(true)
  const [lastSync, setLastSync]       = useState(0)
  const [typeFilter, setTypeFilter]   = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let matchedRoutes: RouteGroup[] = []

      if (routeParam) {
        // ── Route number search ───────────────────────────────────────────────
        const { data: rd } = await supabase
          .from('routes')
          .select('route_no,route_name,from_stop,to_stop,bus_type,ac,depot,capacity,fleet_size,distance_km,duration_mins')
          .ilike('route_no', `%${routeParam}%`)
          .limit(20)
        matchedRoutes = (rd || []).map(r => ({ ...r, buses: [] }))

      } else if (fromParam && toParam) {
        // ── Stop-to-stop search — accurate direction-aware matching ───────────
        const [{ data: allRoutes }, { data: fromStops }, { data: toStops }] = await Promise.all([
          supabase.from('routes').select('route_no,route_name,from_stop,to_stop,bus_type,ac,depot,capacity,fleet_size,distance_km,duration_mins').limit(300),
          supabase.from('bus_stops').select('route_no,stop_index').ilike('stop_name', `%${fromParam}%`),
          supabase.from('bus_stops').select('route_no,stop_index').ilike('stop_name', `%${toParam}%`),
        ])

        // Build min stop_index maps
        const fromMap: Record<string, number> = {}
        const toMap:   Record<string, number> = {}
        ;(fromStops || []).forEach(s => {
          if (fromMap[s.route_no] === undefined || s.stop_index < fromMap[s.route_no])
            fromMap[s.route_no] = s.stop_index
        })
        ;(toStops || []).forEach(s => {
          if (toMap[s.route_no] === undefined || s.stop_index > toMap[s.route_no])
            toMap[s.route_no] = s.stop_index
        })

        const validNos = new Set<string>()
        ;(allRoutes || []).forEach(r => {
          const fi = fromMap[r.route_no], ti = toMap[r.route_no]
          // Stops found on route and from comes before to
          if (fi !== undefined && ti !== undefined && fi < ti) { validNos.add(r.route_no); return }
          // Fallback: endpoint match
          if ((matchStop(r.from_stop, fromParam) && matchStop(r.to_stop, toParam)) ||
              (matchStop(r.to_stop, fromParam)   && matchStop(r.from_stop, toParam))) {
            validNos.add(r.route_no)
          }
        })
        matchedRoutes = (allRoutes || [])
          .filter(r => validNos.has(r.route_no))
          .map(r => ({ ...r, buses: [] }))

      } else {
        // No search params — show all routes
        const { data: rd } = await supabase
          .from('routes')
          .select('route_no,route_name,from_stop,to_stop,bus_type,ac,depot,capacity,fleet_size,distance_km,duration_mins')
          .limit(30)
        matchedRoutes = (rd || []).map(r => ({ ...r, buses: [] }))
      }

      if (matchedRoutes.length === 0) { setGroups([]); setLoading(false); return }

      // ── Fetch buses ─────────────────────────────────────────────────────────
      const routeNos = matchedRoutes.map(r => r.route_no)
      const { data: busData } = await supabase
        .from('buses')
        .select('id,registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,delay_mins')
        .in('route_no', routeNos)
        .order('departure_time', { ascending: true })

      // ── Assign buses to routes, filter to relevant only ─────────────────────
      const grouped: RouteGroup[] = matchedRoutes.map(r => {
        const allBuses = (busData || []).filter(b => b.route_no === r.route_no)
        const window = (fromParam && toParam) ? 180 : 60
        const relevant = allBuses.filter(b => isRelevantBus(b, window))
        // If no relevant buses, show next 2 upcoming
        const display = relevant.length > 0
          ? relevant
          : allBuses.filter(b => timeToMins(b.departure_time) > nowISTMins()).slice(0, 2)
        return { ...r, buses: display }
      }).filter(g => g.buses.length > 0)

      setGroups(grouped)
      setLastSync(0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [fromParam, toParam, routeParam])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const iv = setInterval(fetchData, 25000)
    return () => clearInterval(iv)
  }, [fetchData])
  useEffect(() => {
    const tick = setInterval(() => setLastSync(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  const filtered = groups.filter(g => {
    if (typeFilter !== 'all' && g.bus_type !== typeFilter) return false
    if (quickFilter === 'seats') return g.buses.some(b => Math.round((b.seats_occupied / g.capacity) * 100) < 85 && b.status === 'running')
    if (quickFilter === 'express') return g.bus_type === 'metro_express' || g.bus_type === 'metro_luxury'
    return true
  })

  const totalBuses   = filtered.reduce((s, g) => s + g.buses.length, 0)
  const runningCount = filtered.reduce((s, g) => s + g.buses.filter(b => b.status === 'running').length, 0)
  const isRouteSearch = !!routeParam
  const headerTitle = isRouteSearch
    ? `Route ${routeParam}`
    : fromParam && toParam ? `${fromParam} → ${toParam}` : 'All Buses'

  return (
    <div className="phone-shell">
      <StatusBar />

      <div style={{ background: 'var(--blue)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => nav('/')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{headerTitle}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{filtered.length} routes · {runningCount} running · {totalBuses} shown</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div className="live-dot" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>LIVE · {lastSync}s</span>
        </div>
      </div>

      {fromParam && toParam && (
        <div style={{ background: 'white', margin: '12px 14px 0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fromParam}</div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 14, color: 'var(--blue)' }}>━━🚌━━▶</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{toParam}</div>
        </div>
      )}

      {isRouteSearch && (
        <div style={{ background: 'white', margin: '12px 14px 0', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, padding: '4px 14px', borderRadius: 8 }}>#{routeParam}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{filtered.length} ROUTE{filtered.length !== 1 ? 'S' : ''} · {totalBuses} BUSES</div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>Matching route number</div>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 14px 0' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'white', cursor: 'pointer', appearance: 'auto', boxShadow: 'var(--shadow)' }}>
          <option value="all">🚌 All Bus Types</option>
          <option value="city_ordinary">🔵 City Ordinary</option>
          <option value="metro_express">🟡 Metro Express</option>
          <option value="metro_luxury">🟢 Metro Luxury (A/C)</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', overflowX: 'auto' }}>
        {[{ id:'all', label: t('allBuses') }, { id:'seats', label:'🟢 Available Seats' }, { id:'express', label:'⚡ Express' }].map(f => (
          <button key={f.id} onClick={() => setQuickFilter(f.id)} style={{ padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap', border: `1.5px solid ${quickFilter===f.id?'var(--blue)':'#D1DCF0'}`, background: quickFilter===f.id?'var(--blue)':'white', color: quickFilter===f.id?'white':'var(--mute)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{f.label}</button>
        ))}
      </div>

      <div className="scrollable">
        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontSize: 14 }}>Loading buses...</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚌</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No buses found</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
              {fromParam && toParam ? `No direct routes from "${fromParam}" to "${toParam}". Try shorter names.` : isRouteSearch ? `No route matching "${routeParam}"` : 'Try different stop names'}
            </div>
            <button className="btn-primary" onClick={() => nav('/')} style={{ width: 'auto', padding: '10px 24px' }}>← Search Again</button>
          </div>
        )}

        {!loading && filtered.map(group => {
          // Primary bus: prefer running now, then next upcoming, never a completed trip
          const now_m = nowISTMins()
          const primaryBus =
            group.buses.find(b => {
              const d = timeToMins(b.departure_time), a = timeToMins(b.arrival_time)
              return d <= now_m && now_m <= a  // currently mid-journey
            }) ||
            group.buses.find(b => {
              const d = timeToMins(b.departure_time)
              return d > now_m  // next upcoming departure
            }) ||
            group.buses.find(b => b.status === 'running') ||
            group.buses[0]
          const occPct = primaryBus ? Math.min(100, Math.round((primaryBus.seats_occupied / group.capacity) * 100)) : 0
          const isExpanded = expanded[group.route_no]

          return (
            <div key={group.route_no} style={{ background: 'white', borderRadius: 12, margin: '0 14px 12px', boxShadow: 'var(--shadow)', overflow: 'hidden', border: '1.5px solid transparent', cursor: 'pointer', transition: 'border-color 0.2s' }}
              onClick={() => nav(`/bus?route=${encodeURIComponent(group.route_no)}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>

              <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #F0F4FA' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, padding: '3px 10px', borderRadius: 8, minWidth: 56, textAlign: 'center', flexShrink: 0 }}>{group.route_no}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.from_stop} – {group.to_stop}</div>
                    <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>APSRTC · {BUS_TYPE_LABELS[group.bus_type]} · {group.ac ? 'A/C' : 'Non A/C'}</div>
                  </div>
                  <div style={{ background: 'var(--light)', color: 'var(--blue)', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>🏭 {group.depot}</div>
                </div>
              </div>

              <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: primaryBus?.delay_mins ? '#E65100' : 'var(--text)' }}>{primaryBus?.departure_time || '--:--'}</div>
                  <div style={{ fontSize: 10, color: 'var(--mute)' }}>{group.from_stop.split(',')[0].substring(0, 14)}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                  <div style={{ height: 2, background: 'linear-gradient(to right, var(--blue), var(--teal))', borderRadius: 2, position: 'relative', margin: '4px 0' }}>
                    <span style={{ position: 'absolute', top: -9, left: '42%', fontSize: 14 }}>🚌</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>{minsToHHMM(group.duration_mins)} · {group.distance_km}km</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{primaryBus?.arrival_time || '--:--'}</div>
                  <div style={{ fontSize: 10, color: 'var(--mute)' }}>{group.to_stop.split(',')[0].substring(0, 14)}</div>
                </div>
              </div>

              {primaryBus && (
                <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--gray)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--mute)' }}>VEHICLE · {primaryBus.registration}</div>
                </div>
              )}

              <div style={{ padding: '8px 14px 10px', background: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--mute)', marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: 0.3 }}>Occupancy</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="occ-bar-track" style={{ width: 90 }}>
                      <div className="occ-bar-fill" style={{ width: `${occPct}%`, background: occColor(occPct) }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: occColor(occPct) }}>{occPct}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: occColor(occPct), fontWeight: 600, marginTop: 2 }}>{occLabel(occPct)}</div>
                </div>
                {primaryBus && (
                  <div style={{ textAlign: 'center', marginLeft: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--mute)' }}>{primaryBus.status === 'running' ? 'Status' : 'Departs in'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: primaryBus.status === 'running' ? '#1A7A4A' : 'var(--blue)' }}>{departsIn(primaryBus)}</div>
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); nav(`/bus?route=${encodeURIComponent(group.route_no)}`) }}
                  style={{ background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 10 }}>
                  View →
                </button>
              </div>

              <div style={{ borderTop: '1px solid #F0F4FA' }}>
                <button onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [group.route_no]: !prev[group.route_no] })) }}
                  style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', fontWeight: 600 }}>
                  <span>🚌 FLEET · {group.buses.length} {group.buses.length === 1 ? 'BUS' : 'BUSES'}</span>
                  <span>{isExpanded ? '▲ Hide' : '▼ Show all'}</span>
                </button>

                {group.buses.slice(0, isExpanded ? group.buses.length : 3).map((bus, idx) => {
                  const bPct = Math.min(100, Math.round((bus.seats_occupied / group.capacity) * 100))
                  return (
                    <div key={bus.id} style={{ padding: '7px 14px', background: (() => { const n=nowISTMins(),a=timeToMins(bus.arrival_time); return n>a&&bus.status!=='breakdown'&&bus.status!=='delayed' ? '#F8F8F8' : idx%2===0?'white':'var(--gray)' })(), display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #F0F4FA', opacity: (() => { const n=nowISTMins(),a=timeToMins(bus.arrival_time); return n>a&&bus.status!=='breakdown'&&bus.status!=='delayed' ? 0.45 : 1 })() }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>{bus.registration}</div>
                      <div style={{ fontSize: 11, color: 'var(--mute)', flex: 1 }}>🕐 {bus.departure_time}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div className="occ-bar-track" style={{ width: 40 }}>
                          <div className="occ-bar-fill" style={{ width: `${bPct}%`, background: occColor(bPct) }} />
                        </div>
                        <span style={{ fontSize: 10, color: occColor(bPct), fontWeight: 700 }}>{bPct}%</span>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: STATUS_BG[bus.status] || '#F3F4F6', color: STATUS_COLORS[bus.status] || 'var(--mute)', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {bus.status === 'running' && <span className="live-dot" style={{ width: 5, height: 5 }} />}
                        {(() => {
                          const n = nowISTMins()
                          const d = timeToMins(bus.departure_time)
                          const a = timeToMins(bus.arrival_time)
                          const completed = n > a && bus.status !== 'breakdown' && bus.status !== 'delayed'
                          if (completed) return 'COMPLETED'
                          if (bus.status === 'running') return 'RUNNING'
                          if (bus.status === 'delayed') return 'DELAYED'
                          if (bus.status === 'breakdown') return 'BREAKDOWN'
                          return departsIn(bus)
                        })()}
                      </div>
                    </div>
                  )
                })}

                {!isExpanded && group.buses.length > 3 && (
                  <button onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [group.route_no]: true })) }}
                    style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>
                    + {group.buses.length - 3} more buses
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div style={{ height: 20 }} />
      </div>

      <div className="bottom-nav">
        {[['🏠',t('home'),'/'],['🚌',t('buses'),'/buses'],['🪪',t('epass'),'/epass'],['⏰',t('timetable'),'/timetable'],['👤',t('profile'),'/profile']].map(([icon,label,path],i) => (
          <button key={i} className={`nav-item${window.location.pathname===path?' active':''}`} onClick={() => nav(path)}>
            <div className="nav-icon">{icon}</div>
            {window.location.pathname===path && <div className="nav-dot"/>}
            <div className="nav-label" style={window.location.pathname===path?{color:'var(--blue)'}:{}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
