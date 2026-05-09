import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'

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
  running:   '#1A7A4A',
  delayed:   '#E65100',
  depot:     '#7A8BA6',
  breakdown: '#C0392B',
}

const STATUS_BG: Record<string, string> = {
  running:   '#E8F5E9',
  delayed:   '#FFF3E0',
  depot:     '#F3F4F6',
  breakdown: '#FDECEA',
}

function occColor(pct: number) {
  if (pct >= 85) return '#C0392B'
  if (pct >= 60) return '#F5A623'
  return '#1A7A4A'
}

function occLabel(pct: number) {
  if (pct >= 85) return 'Almost Full'
  if (pct >= 60) return 'Filling Up'
  if (pct === 0)  return 'Empty'
  return 'Available'
}

function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function departsIn(depTime: string, delayMins: number): string {
  const [hh, mm] = depTime.split(':').map(Number)
  const now = new Date()
  const dep = new Date()
  dep.setHours(hh, mm + delayMins, 0, 0)
  const diff = Math.round((dep.getTime() - now.getTime()) / 60000)
  if (diff < 0)   return 'En Route'
  if (diff === 0) return 'Departing'
  if (diff < 60)  return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

export default function Buses() {
  const { t } = useLang()
  const nav = useNavigate()
  const [params] = useSearchParams()

  const fromParam  = params.get('from')  || ''
  const toParam    = params.get('to')    || ''
  const routeParam = params.get('route') || ''

  const [groups, setGroups]       = useState<RouteGroup[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastSync, setLastSync]   = useState(0)
  const [typeFilter, setTypeFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch matching routes
      let routeQuery = supabase
        .from('routes')
        .select('route_no,route_name,from_stop,to_stop,bus_type,ac,depot,capacity,fleet_size,distance_km,duration_mins')

      if (routeParam) {
        routeQuery = routeQuery.ilike('route_no', `%${routeParam}%`)
      } else if (fromParam && toParam) {
        // Routes where from_stop or to_stop contains search terms
        routeQuery = routeQuery.or(
          `from_stop.ilike.%${fromParam}%,to_stop.ilike.%${fromParam}%,from_stop.ilike.%${toParam}%,to_stop.ilike.%${toParam}%`
        )
      }

      const { data: routeData, error: routeErr } = await routeQuery.limit(20)
      if (routeErr || !routeData) { setGroups([]); setLoading(false); return }

      // 2. Fetch buses for those routes
      const routeNos = routeData.map(r => r.route_no)
      if (routeNos.length === 0) { setGroups([]); setLoading(false); return }

      const { data: busData } = await supabase
        .from('buses')
        .select('id,registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,delay_mins')
        .in('route_no', routeNos)
        .order('departure_time', { ascending: true })

      // 3. Group buses under routes
      const grouped: RouteGroup[] = routeData.map(r => ({
        ...r,
        buses: (busData || []).filter(b => b.route_no === r.route_no)
      }))

      setGroups(grouped)
      setLastSync(0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [fromParam, toParam, routeParam])

  // Initial fetch
  useEffect(() => { fetchData() }, [fetchData])

  // Live refresh every 25 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
    }, 25000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Tick the "Xs ago" counter every second
  useEffect(() => {
    const tick = setInterval(() => setLastSync(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  // Apply filters
  const filtered = groups.filter(g => {
    if (typeFilter !== 'all' && g.bus_type !== typeFilter) return false
    if (quickFilter === 'seats') return g.buses.some(b => {
      const pct = Math.round((b.seats_occupied / g.capacity) * 100)
      return pct < 85 && b.status === 'running'
    })
    if (quickFilter === 'express') return g.bus_type === 'metro_express' || g.bus_type === 'metro_luxury'
    return true
  })

  const totalBuses = filtered.reduce((s, g) => s + g.buses.length, 0)

  const isRouteSearch = !!routeParam
  const headerTitle = isRouteSearch
    ? `Route ${routeParam}`
    : fromParam && toParam
    ? `${fromParam} → ${toParam}`
    : 'All Buses'

  return (
    <div className="phone-shell">
      {/* STATUS BAR */}
      <div className="status-bar">
        <span>9:41 AM</span>
        <span>APSRTC APCityPrayaanam • 4G</span>
      </div>

      {/* HEADER */}
      <div style={{ background: 'var(--blue)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => nav('/')} style={{
          width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          border: 'none', color: 'white', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {headerTitle}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            {filtered.length} routes · {totalBuses} buses
          </div>
        </div>
        {/* Live badge */}
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div className="live-dot" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>
            LIVE · {lastSync}s
          </span>
        </div>
      </div>

      {/* ROUTE SUMMARY (stop search only) */}
      {fromParam && toParam && (
        <div style={{ background: 'white', margin: '12px 14px 0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fromParam}</div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 14, color: 'var(--blue)' }}>━━🚌━━▶</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{toParam}</div>
        </div>
      )}

      {/* ROUTE NUMBER BANNER (route search only) */}
      {isRouteSearch && (
        <div style={{ background: 'white', margin: '12px 14px 0', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, padding: '4px 14px', borderRadius: 8 }}>
            #{routeParam}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {filtered.length} ROUTE{filtered.length !== 1 ? 'S' : ''} · {totalBuses} BUSES
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>Matching route number</div>
          </div>
        </div>
      )}

      {/* BUS TYPE FILTER DROPDOWN */}
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ position: 'relative' }}>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0',
              borderRadius: 10, fontSize: 13, fontWeight: 500, color: 'var(--text)',
              background: 'white', cursor: 'pointer', appearance: 'auto',
              boxShadow: 'var(--shadow)',
            }}>
            <option value="all">🚌 All Bus Types</option>
            <option value="city_ordinary">🔵 City Ordinary</option>
            <option value="metro_express">🟡 Metro Express</option>
            <option value="metro_luxury">🟢 Metro Luxury (A/C)</option>
          </select>
        </div>
      </div>

      {/* QUICK FILTER TABS */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', overflowX: 'auto' }}>
        {[
          { id: 'all',     label: t('allBuses') },
          { id: 'seats',   label: '🟢 Available Seats' },
          { id: 'express', label: '⚡ Express' },
        ].map(f => (
          <button key={f.id} onClick={() => setQuickFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            border: `1.5px solid ${quickFilter === f.id ? 'var(--blue)' : '#D1DCF0'}`,
            background: quickFilter === f.id ? 'var(--blue)' : 'white',
            color: quickFilter === f.id ? 'white' : 'var(--mute)',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>{f.label}</button>
        ))}
      </div>

      {/* SCROLLABLE RESULTS */}
      <div className="scrollable">

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontSize: 14 }}>
            Loading buses...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚌</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No buses found</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
              {isRouteSearch
                ? `No route matching "${routeParam}" in Vizag`
                : 'Try different stop names or check spelling'}
            </div>
            <button className="btn-primary" onClick={() => nav('/')} style={{ width: 'auto', padding: '10px 24px' }}>
              ← Search Again
            </button>
          </div>
        )}

        {!loading && filtered.map(group => {
          const primaryBus = group.buses[0]
          const occPct = primaryBus
            ? Math.round((primaryBus.seats_occupied / group.capacity) * 100)
            : 0
          const isExpanded = expanded[group.route_no]

          return (
            <div key={group.route_no} style={{
              background: 'white', borderRadius: 12, margin: '0 14px 12px',
              boxShadow: 'var(--shadow)', overflow: 'hidden',
              border: '1.5px solid transparent', cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
              onClick={() => nav(`/bus/${group.route_no}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>

              {/* CARD HEADER */}
              <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #F0F4FA' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Route badge */}
                  <div style={{
                    background: 'var(--blue)', color: 'white',
                    fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 8, minWidth: 56, textAlign: 'center',
                    letterSpacing: 0.5, flexShrink: 0,
                  }}>{group.route_no}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.from_stop} – {group.to_stop}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                      APSRTC · {BUS_TYPE_LABELS[group.bus_type]} · {group.ac ? 'A/C' : 'Non A/C'}
                    </div>
                  </div>

                  {/* Depot badge */}
                  <div style={{
                    background: 'var(--light)', color: 'var(--blue)',
                    fontSize: 10, fontWeight: 600, padding: '3px 8px',
                    borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap',
                  }}>🏭 {group.depot}</div>
                </div>
              </div>

              {/* TIMING ROW */}
              <div style={{ padding: '10px 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: primaryBus?.delay_mins ? '#E65100' : 'var(--text)' }}>
                    {primaryBus?.departure_time || '--:--'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--mute)' }}>{group.from_stop.split(',')[0].substring(0, 14)}</div>
                </div>

                <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                  <div style={{ height: 2, background: `linear-gradient(to right, var(--blue), var(--teal))`, borderRadius: 2, position: 'relative', margin: '4px 0' }}>
                    <span style={{ position: 'absolute', top: -9, left: '42%', fontSize: 14 }}>🚌</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>
                    {minsToHHMM(group.duration_mins)} · {group.distance_km}km
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
                    {primaryBus?.arrival_time || '--:--'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--mute)' }}>{group.to_stop.split(',')[0].substring(0, 14)}</div>
                </div>
              </div>

              {/* VEHICLE + DEPARTS IN */}
              {primaryBus && (
                <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--gray)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--mute)' }}>
                    VEHICLE · {primaryBus.registration}
                  </div>
                </div>
              )}

              {/* OCCUPANCY + DEPARTS */}
              <div style={{ padding: '8px 14px 10px', background: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--mute)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Occupancy</div>
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
                    <div style={{ fontSize: 10, color: 'var(--mute)' }}>
                      {primaryBus.delay_mins > 0 ? 'Delayed' : 'Departs in'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: primaryBus.delay_mins > 0 ? '#E65100' : 'var(--blue)' }}>
                      {departsIn(primaryBus.departure_time, primaryBus.delay_mins)}
                    </div>
                  </div>
                )}

                <button
                  onClick={e => { e.stopPropagation(); nav(`/bus/${group.route_no}`) }}
                  style={{ background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 10 }}>
                  View →
                </button>
              </div>

              {/* FLEET SECTION */}
              <div style={{ borderTop: '1px solid #F0F4FA' }}>
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [group.route_no]: !prev[group.route_no] })) }}
                  style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', fontWeight: 600 }}>
                  <span>🚌 FLEET · {group.buses.length} BUSES</span>
                  <span>{isExpanded ? '▲ Hide' : '▼ Show all'}</span>
                </button>

                {/* Always show first 3 buses */}
                {group.buses.slice(0, isExpanded ? group.buses.length : 3).map((bus, idx) => {
                  const bPct = Math.round((bus.seats_occupied / group.capacity) * 100)
                  return (
                    <div key={bus.id} style={{
                      padding: '6px 14px',
                      background: idx % 2 === 0 ? 'white' : 'var(--gray)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      borderTop: '1px solid #F0F4FA',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>
                        {bus.registration}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--mute)', flex: 1 }}>
                        🕐 {bus.departure_time}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div className="occ-bar-track" style={{ width: 40 }}>
                          <div className="occ-bar-fill" style={{ width: `${bPct}%`, background: occColor(bPct) }} />
                        </div>
                        <span style={{ fontSize: 10, color: occColor(bPct), fontWeight: 700 }}>{bPct}%</span>
                      </div>
                      <div style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: STATUS_BG[bus.status] || '#F3F4F6',
                        color: STATUS_COLORS[bus.status] || 'var(--mute)',
                        textTransform: 'uppercase',
                      }}>
                        {bus.status === 'running' ? <><span className="live-dot" style={{ width: 5, height: 5 }} />{' '}</> : null}
                        {bus.status}
                      </div>
                    </div>
                  )
                })}

                {!isExpanded && group.buses.length > 3 && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [group.route_no]: true })) }}
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

      {/* BOTTOM NAV */}
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

