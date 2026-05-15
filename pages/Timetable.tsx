import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import StatusBar from './StatusBar'

interface RouteRow {
  route_no: string
  from_stop: string
  to_stop: string
  bus_type: string
  distance_km: number
  duration_mins: number
  depot: string
}

interface TimetableSlot {
  route_no: string
  departure_time: string
  arrival_time: string
  days_of_operation: string
}

function nowISTMins(): number {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours() * 60 + ist.getMinutes()
}
function toMins(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function fmt(t: string): string {
  if (!t) return '--'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function isRunning(dep: string, arr: string): boolean {
  const n = nowISTMins()
  return toMins(dep) <= n && n <= toMins(arr)
}

function countdown(dep: string): string {
  const diff = toMins(dep) - nowISTMins()
  if (diff < 0) return 'Departed'
  if (diff === 0) return 'Now'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff/60)}h ${diff%60}m`
}
function formatDur(m: number) {
  const h = Math.floor(m/60), r = m%60
  return h === 0 ? `${r} min` : r > 0 ? `${h}h ${r}min` : `${h}h`
}
const BT: Record<string,string> = { city_ordinary:'City Ordinary', metro_express:'Metro Express', metro_luxury:'Metro Luxury' }

export default function Timetable() {
  const { t } = useLang()
  const nav = useNavigate()

  const [routes, setRoutes]         = useState<RouteRow[]>([])
  const [slots, setSlots]           = useState<TimetableSlot[]>([])
  const [selRoute, setSelRoute]     = useState('')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [sloading, setSloading]     = useState(false)
  const [showAll, setShowAll]       = useState(false)
  const [tick, setTick]             = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(x => x+1), 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    supabase.from('routes')
      .select('route_no,from_stop,to_stop,bus_type,distance_km,duration_mins,depot')
      .order('route_no', { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setRoutes(data); setLoading(false) })
  }, [])

  const fetchSlots = useCallback(async (rno: string) => {
    setSloading(true)

    // PRIMARY SOURCE: buses table — real vehicle registrations with actual departure times
    // This guarantees Timetable matches what Buses screen shows
    const { data: bd } = await supabase
      .from('buses')
      .select('departure_time, arrival_time, route_no, registration, status')
      .eq('route_no', rno)
      .order('departure_time', { ascending: true })

    if (bd && bd.length > 0) {
      // Deduplicate by departure_time (multiple buses may share same time)
      const seen = new Set<string>()
      const unique = bd.filter(b => {
        if (seen.has(b.departure_time)) return false
        seen.add(b.departure_time)
        return true
      })
      setSlots(unique.map(b => ({
        route_no: rno,
        departure_time: b.departure_time,
        arrival_time: b.arrival_time,
        days_of_operation: 'Daily',
      })))
      setSloading(false)
      return
    }

    // FALLBACK: timetable table if no buses found for this route
    const { data: tt } = await supabase
      .from('timetable')
      .select('route_no, departure_time, arrival_time, days_of_operation')
      .eq('route_no', rno)
      .order('departure_time', { ascending: true })
    setSlots((tt || []))
    setSloading(false)
  }, [])

  useEffect(() => { if (selRoute) fetchSlots(selRoute) }, [selRoute, fetchSlots])

  const now = nowISTMins()
  const filtered = routes.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.route_no.toLowerCase().includes(q) || r.from_stop.toLowerCase().includes(q) || r.to_stop.toLowerCase().includes(q)
  })
  const selR = routes.find(r => r.route_no === selRoute)
  // Timetable shows FULL DAY schedule — past = completed, present = running, future = upcoming
  // Slots are already ordered by departure_time ASC from Supabase
  const past     = slots.filter(s => toMins(s.departure_time) < now - 5 &&
                                     !isRunning(s.departure_time, s.arrival_time))
  const upcoming = slots.filter(s => toMins(s.departure_time) >= now - 5 ||
                                     isRunning(s.departure_time, s.arrival_time))
  const display  = slots  // Always show ALL slots — full day timetable
  const nextBus  = slots.find(s => toMins(s.departure_time) >= now)

  return (
    <div className="phone-shell screen-enter">
      <StatusBar />

      <div style={{ background: 'var(--blue)', padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => nav('/')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white' }}>⏰ {t('timetable')}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{routes.length} routes · Visakhapatnam</div>
          </div>
        </div>
        <input type="text" placeholder="Search route number or stop name..." value={search}
          onChange={e => { setSearch(e.target.value); setSelRoute('') }}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' as const }} />
      </div>

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 150px)' }}>

        {/* Route list */}
        {!selRoute && (
          <>
            {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)' }}>Loading routes...</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 14, color: 'var(--mute)' }}>No routes found for "{search}"</div>
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <>
                <div style={{ padding: '12px 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>
                  {search ? `${filtered.length} routes found` : 'Tap a route to view schedule'}
                </div>
                <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map(r => (
                    <button key={r.route_no} onClick={() => setSelRoute(r.route_no)}
                      style={{ background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: 'var(--shadow)', border: '1.5px solid #EEF2F8', cursor: 'pointer', textAlign: 'left' as const, width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, padding: '3px 10px', borderRadius: 8, minWidth: 52, textAlign: 'center' as const, flexShrink: 0 }}>{r.route_no}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.from_stop} → {r.to_stop}</div>
                        <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>{BT[r.bus_type]} · {r.distance_km}km · {formatDur(r.duration_mins)}</div>
                      </div>
                      <span style={{ fontSize: 16, color: 'var(--blue)' }}>›</span>
                    </button>
                  ))}
                </div>
                <div style={{ height: 20 }} />
              </>
            )}
          </>
        )}

        {/* Timetable for selected route */}
        {selRoute && (
          <>
            {/* Route card */}
            <div style={{ margin: '12px 14px 0', background: 'white', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: nextBus ? 12 : 0 }}>
                <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, padding: '3px 12px', borderRadius: 8 }}>{selRoute}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selR?.from_stop} → {selR?.to_stop}</div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{selR && BT[selR.bus_type]} · {selR?.distance_km}km · {selR && formatDur(selR.duration_mins)}</div>
                </div>
                <button onClick={() => { setSelRoute(''); setSlots([]) }}
                  style={{ background: '#F4F6FA', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--mute)', fontWeight: 600, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Next bus highlight */}
              {nextBus && (
                <div style={{ background: 'linear-gradient(135deg,var(--blue),#1A4A9A)', borderRadius: 10, padding: '12px 14px', color: 'white' }}>
                  <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 }}>
                    {toMins(nextBus.departure_time) <= now && now <= toMins(nextBus.arrival_time) ? '🚌 Currently running' : 'Next bus'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 28, fontWeight: 700 }}>{fmt(nextBus.departure_time)}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>Arrives {fmt(nextBus.arrival_time)} · {nextBus.days_of_operation}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '6px 14px', fontSize: 14, fontWeight: 700 }}>
                      {countdown(nextBus.departure_time)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '10px 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Schedule — {slots.length} buses</span>
              <span style={{ fontSize: 11, fontWeight: 400 }}>{past.length} done · {upcoming.length} upcoming</span>
            </div>

            {sloading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--mute)' }}>Loading schedule...</div>}

            {!sloading && slots.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 12 }}>No timetable data for this route.</div>
                <button onClick={() => nav(`/buses?route=${selRoute}`)}
                  style={{ background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  View live buses →
                </button>
              </div>
            )}

            {!sloading && slots.length > 0 && (
              <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {display.map((slot, idx) => {
                  const dep = toMins(slot.departure_time)
                  const arr = toMins(slot.arrival_time)
                  const running  = dep <= now && now <= arr
                  const isN      = dep >= now && dep - now <= 90
                  const departed = dep < now - 5 && !running
                  // Show NOW divider before the first non-completed trip
                  const prevSlot = display[idx - 1]
                  const showNowDivider = idx > 0 && prevSlot &&
                    toMins(prevSlot.departure_time) < now - 5 &&
                    !isRunning(prevSlot.departure_time, prevSlot.arrival_time) &&
                    (running || (!departed))
                  const diff     = dep - now

                  return (
                    <>
                    {showNowDivider && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 0', margin: '4px 0',
                      }}>
                        <div style={{ flex: 1, height: 1.5, background: 'var(--blue)', opacity: 0.3 }} />
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: 'var(--blue)',
                          background: '#EFF6FF', padding: '3px 10px', borderRadius: 20,
                          border: '1px solid var(--blue)', whiteSpace: 'nowrap',
                        }}>
                          ▼ NOW — {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                        </div>
                        <div style={{ flex: 1, height: 1.5, background: 'var(--blue)', opacity: 0.3 }} />
                      </div>
                    )}
                    <div key={idx} style={{
                      background: running ? '#E8F5E9' : isN ? '#EFF6FF' : departed ? '#F8F8F8' : 'white',
                      borderRadius: 10, padding: '10px 14px', boxShadow: departed ? 'none' : 'var(--shadow)',
                      border: running ? '1.5px solid #1A7A4A' : isN ? '1.5px solid var(--blue)' : departed ? '1px solid #F0F0F0' : '1.5px solid #EEF2F8',
                      display: 'flex', alignItems: 'center', gap: 12, opacity: departed ? 0.6 : 1,
                    }}>
                      <div style={{ minWidth: 70, textAlign: 'center' as const }}>
                        <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: departed ? 400 : 700, color: running ? '#1A7A4A' : isN ? 'var(--blue)' : departed ? '#9CA3AF' : 'var(--text)' }}>
                          {fmt(slot.departure_time)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--mute)' }}>→ {fmt(slot.arrival_time)}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--mute)' }}>{slot.days_of_operation}</div>
                        {running && <div style={{ fontSize: 11, fontWeight: 600, color: '#1A7A4A', display: 'flex', alignItems: 'center', gap: 4 }}><span className="live-dot" style={{ width: 6, height: 6 }} />En Route now</div>}
                        {isN && !running && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>Next bus</div>}
                      </div>
                      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                        {running ? (
                          <div style={{ background: '#1A7A4A', color: 'white', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>Running</div>
                        ) : departed ? (
                          <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span>✓</span> Completed
                        </div>
                        ) : (
                          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, color: isN ? 'var(--blue)' : 'var(--mute)' }}>
                            {diff < 60 ? `${diff}m` : `${Math.floor(diff/60)}h ${diff%60}m`}
                          </div>
                        )}
                      </div>
                    </div>
                    </>
                  )
                })}



                <button onClick={() => nav(`/buses?route=${selRoute}`)}
                  style={{ width: '100%', padding: 12, background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                  🚌 View Live Buses on {selRoute}
                </button>
              </div>
            )}
            <div style={{ height: 20 }} />
          </>
        )}
      </div>

      <div className="bottom-nav">
        {([['🏠',t('home'),'/'],['🚌',t('buses'),'/buses'],['🪪',t('epass'),'/epass'],['⏰',t('timetable'),'/timetable'],['👤',t('profile'),'/profile']] as [string,string,string][]).map(([icon,label,path],i) => (
          <button key={i} className={`nav-item${path==='/timetable'?' active':''}`} onClick={() => nav(path)}>
            <div className="nav-icon">{icon}</div>
            {path==='/timetable' && <div className="nav-dot"/>}
            <div className="nav-label" style={path==='/timetable'?{color:'var(--blue)'}:{}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
