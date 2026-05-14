import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import StatusBar from './StatusBar'

interface Stop {
  id: string
  stop_name: string
  stop_index: number
  landmark: string
}

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
  driver_mobile: string
  delay_mins: number
}

interface RouteInfo {
  route_no: string
  route_name: string
  from_stop: string
  to_stop: string
  bus_type: string
  ac: boolean
  depot: string
  capacity: number
  distance_km: number
  duration_mins: number
}

const BUS_TYPE_LABELS: Record<string, string> = {
  city_ordinary: 'City Ordinary',
  metro_express: 'Metro Express',
  metro_luxury: 'Metro Luxury',
}

const FARE_RATES: Record<string, number> = {
  city_ordinary: 1.8,
  metro_express: 2.5,
  metro_luxury: 3.5,
}

function occColor(pct: number) {
  if (pct >= 85) return '#C0392B'
  if (pct >= 60) return '#F5A623'
  return '#1A7A4A'
}

function occMsg(pct: number) {
  if (pct >= 85) return '🔴 Almost Full — Consider next bus'
  if (pct >= 60) return '🟡 Filling Up — Board at next stop'
  return '🟢 Comfortable — Plenty of seats'
}

function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }
  return `${mins} min`
}

// ── IST time helpers ──────────────────────────────────────────────────────────
function nowISTMins(): number {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours() * 60 + ist.getMinutes()
}

function timeStrToMins(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minsToTimeStr(totalMins: number): string {
  const m = totalMins % (24 * 60)
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/**
 * Calculate which stop_index the bus is currently at based on IST time.
 * Uses linear interpolation: elapsed / total_duration * num_stops.
 * This is the single source of truth — database current_stop_index is ignored.
 */
function calcCurrentStopIndex(
  depTime: string,
  arrTime: string,
  totalStops: number,
  delayMins: number,
  busStatus: string
): number {
  if (busStatus === 'depot') return 1
  if (totalStops <= 1) return 1

  const now    = nowISTMins()
  const dep    = timeStrToMins(depTime) + (delayMins || 0)
  const arr    = timeStrToMins(arrTime) + (delayMins || 0)
  const dur    = arr - dep

  if (dur <= 0) return 1
  if (now < dep) return 1           // not departed yet
  if (now >= arr) return totalStops // completed journey

  const elapsed  = now - dep
  const progress = elapsed / dur    // 0.0 to 1.0

  // Map progress to stop index (1-based)
  const idx = Math.max(1, Math.min(totalStops, Math.floor(progress * totalStops) + 1))
  return idx
}

/**
 * Calculate stop time for a given stop index using linear interpolation.
 */
function calcStopTime(
  depTime: string,
  arrTime: string,
  stopIdx: number,
  totalStops: number,
  delayMins: number
): string {
  const dep = timeStrToMins(depTime) + (delayMins || 0)
  const arr = timeStrToMins(arrTime) + (delayMins || 0)
  const dur = arr - dep
  if (totalStops <= 1) return depTime
  const segMins = Math.round((dur / (totalStops - 1)) * (stopIdx - 1))
  return minsToTimeStr(dep + segMins)
}

/**
 * Calculate realistic occupancy based on IST time.
 * Passengers board at start, peak in middle, alight at destination.
 */
function calcOccupancy(
  capacity: number,
  depTime: string,
  arrTime: string,
  seatsOccupied: number,
  busStatus: string
): number {
  if (busStatus === 'depot' || busStatus === 'breakdown') {
    return busStatus === 'breakdown' ? Math.min(100, Math.round((seatsOccupied / capacity) * 100)) : 0
  }

  const now    = nowISTMins()
  const dep    = timeStrToMins(depTime)
  const arr    = timeStrToMins(arrTime)
  const dur    = arr - dep

  // If database has a valid non-zero occupancy, trust it (set by cron)
  if (seatsOccupied > 0) {
    return Math.min(100, Math.round((seatsOccupied / capacity) * 100))
  }

  // Fallback: estimate from time of day
  if (dur <= 0 || now < dep) return 0
  if (now >= arr) return 0

  const progress = (now - dep) / dur  // 0 to 1
  const hour     = Math.floor(now / 60)

  // Peak hours: 06-09 morning, 17-20 evening
  const isPeakMorning = hour >= 6 && hour <= 9
  const isPeakEvening = hour >= 17 && hour <= 20

  // Bell curve: low at start, peak at 40-60% of journey, drops near end
  const journeyFactor = Math.sin(progress * Math.PI)  // 0 → 1 → 0

  let baseOccupancy: number
  if (isPeakMorning || isPeakEvening) {
    baseOccupancy = 0.55 + journeyFactor * 0.35  // 55-90%
  } else {
    baseOccupancy = 0.20 + journeyFactor * 0.35  // 20-55%
  }

  return Math.min(100, Math.round(baseOccupancy * 100))
}

export default function BusDetail() {
  const { t } = useLang()
  const nav = useNavigate()
  const { id: routeNo } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const busId = params.get('bus')

  const [route, setRoute]       = useState<RouteInfo | null>(null)
  const [stops, setStops]       = useState<Stop[]>([])
  const [buses, setBuses]       = useState<BusRow[]>([])
  const [selBus, setSelBus]     = useState<BusRow | null>(null)
  const [lastSync, setLastSync] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [booked, setBooked]     = useState(false)

  const fetchData = useCallback(async () => {
    if (!routeNo) return
    try {
      const [rRes, sRes, bRes] = await Promise.all([
        supabase.from('routes').select('*').eq('route_no', routeNo).single(),
        supabase.from('bus_stops').select('id,stop_name,stop_index,landmark').eq('route_no', routeNo).order('stop_index', { ascending: true }),
        supabase.from('buses').select('id,registration,route_no,status,current_stop_index,seats_occupied,departure_time,arrival_time,driver_name,driver_mobile,delay_mins').eq('route_no', routeNo).order('departure_time', { ascending: true }),
      ])

      if (rRes.data) setRoute(rRes.data)
      if (sRes.data) setStops(sRes.data)
      if (bRes.data) {
        setBuses(bRes.data)
        if (busId) {
          const found = bRes.data.find(b => b.id === busId)
          if (found) { setSelBus(found); setLastSync(0); return }
        }
        // Prefer currently running bus
        const now = nowISTMins()
        const running = bRes.data.find(b => {
          const dep = timeStrToMins(b.departure_time)
          const arr = timeStrToMins(b.arrival_time)
          return dep <= now && now <= arr
        }) || bRes.data.find(b => b.status === 'running') || bRes.data[0]
        setSelBus(running || null)
      }
      setLastSync(0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [routeNo, busId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const iv = setInterval(fetchData, 25000)
    return () => clearInterval(iv)
  }, [fetchData])
  useEffect(() => {
    const tick = setInterval(() => setLastSync(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  if (loading) return (
    <div className="phone-shell"><StatusBar />
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--mute)' }}>Loading route...</div>
    </div>
  )
  if (!route) return (
    <div className="phone-shell"><StatusBar />
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Route not found</div>
        <button className="btn-primary" onClick={() => nav(-1)}>← Go Back</button>
      </div>
    </div>
  )

  // ── KEY FIX: compute stop index from IST time, not from database ──────────
  const totalStops = stops.length || 5
  const currentIdx = selBus
    ? calcCurrentStopIndex(
        selBus.departure_time,
        selBus.arrival_time,
        totalStops,
        selBus.delay_mins || 0,
        selBus.status
      )
    : 1

  // ── KEY FIX: compute occupancy correctly ──────────────────────────────────
  const capacity  = route.capacity
  const occPct    = selBus
    ? calcOccupancy(capacity, selBus.departure_time, selBus.arrival_time, selBus.seats_occupied, selBus.status)
    : 0
  const occupied  = Math.round((occPct / 100) * capacity)
  const seatsLeft = capacity - occupied

  const baseFare  = Math.round(route.distance_km * (FARE_RATES[route.bus_type] || 2))
  const resFee    = route.ac ? 20 : 10
  const totalFare = baseFare + resFee

  const statusMap: Record<string, { label: string; bg: string; color: string }> = {
    running:   { label: 'Running',   bg: '#E8F5E9', color: '#1A7A4A' },
    delayed:   { label: `Delayed ${selBus?.delay_mins || 0} min`, bg: '#FFF3E0', color: '#E65100' },
    depot:     { label: 'At Depot',  bg: '#F3F4F6', color: '#7A8BA6' },
    breakdown: { label: 'Breakdown', bg: '#FDECEA', color: '#C0392B' },
  }
  const statusInfo = statusMap[selBus?.status || 'depot'] || statusMap.depot

  // Determine bus status from IST time (more accurate than DB status)
  const now = nowISTMins()
  const depMins = selBus ? timeStrToMins(selBus.departure_time) : 0
  const arrMins = selBus ? timeStrToMins(selBus.arrival_time) : 0
  const isCurrentlyRunning = selBus && depMins <= now && now <= arrMins
  const hasNotDeparted = selBus && now < depMins
  const hasCompleted = selBus && now > arrMins

  const R    = 28
  const circ = 2 * Math.PI * R
  const offset = circ - (occPct / 100) * circ

  return (
    <div className="phone-shell">
      <StatusBar />

      {/* HEADER */}
      <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={() => nav(-1)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 26, fontWeight: 700, color: 'white', lineHeight: 1 }}>{route.route_no}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{route.from_stop} – {route.to_stop}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>LIVE · {lastSync}s AGO</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--light)', color: 'var(--blue)', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            🕐 {selBus?.departure_time || '--'} → {selBus?.arrival_time || '--'}
          </div>
          <div style={{ background: '#FFF8E1', color: '#9A6700', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>APSRTC</div>
          <div style={{ background: '#E8F5E9', color: '#1A7A4A', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            {formatDuration(route.duration_mins)}
          </div>
          <div style={{ background: isCurrentlyRunning ? '#E8F5E9' : hasNotDeparted ? '#EFF6FF' : '#F3F4F6', color: isCurrentlyRunning ? '#1A7A4A' : hasNotDeparted ? '#1B3A6B' : '#7A8BA6', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            {isCurrentlyRunning && <span className="live-dot" style={{ width: 5, height: 5, marginRight: 3 }} />}
            {isCurrentlyRunning ? 'Running' : hasNotDeparted ? `Departs in ${depMins - now} min` : hasCompleted ? 'Trip completed' : statusInfo.label}
          </div>
        </div>
      </div>

      {/* BUS SELECTOR */}
      {buses.length > 1 && (
        <div style={{ background: 'white', padding: '10px 14px', borderBottom: '1px solid #EEF2F8' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.3 }}>
            Select bus — {buses.length} available
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {buses.map(b => {
              const bDep = timeStrToMins(b.departure_time)
              const bArr = timeStrToMins(b.arrival_time)
              const bRunning = bDep <= now && now <= bArr
              return (
                <button key={b.id} onClick={() => setSelBus(b)} style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: `1.5px solid ${selBus?.id === b.id ? 'var(--blue)' : '#E2E8F0'}`,
                  background: selBus?.id === b.id ? 'var(--blue)' : bRunning ? '#E8F5E9' : 'white',
                  color: selBus?.id === b.id ? 'white' : bRunning ? '#1A7A4A' : 'var(--text)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {bRunning && <span className="live-dot" style={{ width: 5, height: 5, marginRight: 3 }} />}
                  {b.registration} · {b.departure_time}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 220px)' }}>

        {/* ROUTE TRACKER — IST-correct */}
        <div style={{ background: 'white', margin: 14, borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🚌 {t('liveRoute')} — Bus Position & Stops</span>
            <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>LIVE · {lastSync}s AGO</span>
          </div>

          {stops.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--mute)', fontSize: 13 }}>Stop data loading...</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 44 }}>
              {stops.map((stop, idx) => {
                const isLast        = idx === stops.length - 1
                const isPassed      = stop.stop_index < currentIdx
                const isCurrent     = stop.stop_index === currentIdx
                const isDestination = isLast

                // ── Stop time calculated from IST, not hardcoded ──────────────
                const stopTime = selBus
                  ? calcStopTime(
                      selBus.departure_time,
                      selBus.arrival_time,
                      stop.stop_index,
                      totalStops,
                      selBus.delay_mins || 0
                    )
                  : '--:--'

                let circleStyle: React.CSSProperties = {
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2.5px solid #D1DCF0', background: 'white',
                  zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }
                let innerDot = null
                let nameStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: '20px' }
                let badge = null
                let connStyle: React.CSSProperties = { width: 3, flex: 1, minHeight: 28, background: '#E2E8F0' }

                if (isPassed) {
                  circleStyle = { ...circleStyle, background: '#E8F5E9', borderColor: '#1A7A4A' }
                  innerDot = <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1A7A4A' }} />
                  nameStyle = { ...nameStyle, color: '#1A7A4A' }
                  connStyle = { ...connStyle, background: '#1A7A4A' }
                } else if (isCurrent) {
                  circleStyle = { ...circleStyle, width: 24, height: 24, background: 'var(--blue)', borderColor: 'var(--blue)', boxShadow: '0 0 0 4px rgba(27,58,107,0.18)' }
                  innerDot = <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
                  nameStyle = { ...nameStyle, fontWeight: 700, color: 'var(--blue)', fontSize: 14 }
                  badge = <span style={{ display: 'inline-block', background: 'var(--blue)', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 6, verticalAlign: 'middle' }}>🚌 {t('busHere')}</span>
                  connStyle = { ...connStyle, background: 'linear-gradient(to bottom, var(--blue), #E2E8F0)' }
                } else if (isDestination && !isPassed && !isCurrent) {
                  nameStyle = { ...nameStyle, fontWeight: 600 }
                  badge = <span style={{ display: 'inline-block', background: '#FDECEA', color: '#C0392B', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 6, verticalAlign: 'middle' }}>🏁 {t('destination')}</span>
                }

                return (
                  <div key={stop.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', marginBottom: 0 }}>
                    <div style={{ position: 'absolute', left: -44, top: 0, width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={circleStyle}>{innerDot}</div>
                      {!isLast && <div style={connStyle} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 4 : 24, flex: 1 }}>
                      <div style={nameStyle}>{stop.stop_name}{badge}</div>
                      <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
                        {stopTime}{stop.landmark ? ` · ${stop.landmark}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* OCCUPANCY DONUT */}
        <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 }}>
            📊 {t('liveOccupancy')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={36} cy={36} r={R} fill="none" stroke="#E2E8F0" strokeWidth={8} />
                <circle cx={36} cy={36} r={R} fill="none" stroke={occColor(occPct)} strokeWidth={8}
                  strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }} />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {occPct}%
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                <span style={{ color: '#1A7A4A' }}>{seatsLeft} {t('seatsLeft')}</span> of {capacity}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
                {selBus?.seats_occupied ? 'From ePoS ticket data' : 'Estimated from time of day'}
              </div>
              <div style={{ display: 'inline-block', marginTop: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: occPct >= 85 ? '#FDECEA' : occPct >= 60 ? '#FFF3E0' : '#E8F5E9', color: occColor(occPct) }}>
                {occMsg(occPct)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: `${occPct}%`, background: occColor(occPct), transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--mute)' }}>
              <span>0% Empty</span><span>60% Filling</span><span>100% Full</span>
            </div>
          </div>
        </div>

        {/* FARE */}
        <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 }}>
            🎫 {t('fareBreakdown')}
          </div>
          {[
            { label: 'Route',    value: `${route.from_stop} → ${route.to_stop}` },
            { label: 'Distance', value: `${route.distance_km} km` },
            { label: 'Bus Type', value: `${BUS_TYPE_LABELS[route.bus_type]} (${route.ac ? 'A/C' : 'Non A/C'})` },
            { label: 'Base Fare', value: `₹ ${baseFare}` },
            { label: route.ac ? 'A/C Reservation' : 'Reservation', value: `₹ ${resFee}` },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F0F4FA' }}>
              <div style={{ fontSize: 13, color: 'var(--mute)' }}>{row.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right', maxWidth: '60%' }}>{row.value}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('totalFare')}</div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--blue)' }}>₹ {totalFare}</div>
          </div>
        </div>

        {/* DRIVER */}
        {selBus?.driver_name && (
          <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 }}>
              👨‍✈️ Driver Info
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{selBus.driver_name}</div>
                <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Driver · {selBus.registration}</div>
              </div>
              <a href={`tel:${selBus.driver_mobile}`} style={{ background: 'var(--light)', color: 'var(--blue)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                📞 Call
              </a>
            </div>
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>

      {/* BOOK BAR */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 390, background: 'white', borderTop: '1px solid #EEF2F8', padding: '12px 14px', display: 'flex', gap: 10, zIndex: 100, boxShadow: '0 -4px 20px rgba(13,43,94,0.08)' }}>
        <button style={{ width: 48, background: 'var(--light)', border: 'none', borderRadius: 10, color: 'var(--blue)', fontSize: 18, cursor: 'pointer' }}
          onClick={() => navigator.share && navigator.share({ title: `Bus ${routeNo}`, url: window.location.href })}>↗</button>
        {booked ? (
          <div style={{ flex: 1, padding: '13px', background: '#E8F5E9', borderRadius: 10, textAlign: 'center', fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 700, color: '#1A7A4A' }}>
            ✓ Pass Requested — Check ePass section
          </div>
        ) : (
          <button className="btn-primary" style={{ flex: 1, padding: '13px' }}
            onClick={() => { setBooked(true); nav('/epass') }}>
            🎫 {t('bookGetPass')}
          </button>
        )}
      </div>
    </div>
  )
}
