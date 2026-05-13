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

// FIX: properly format duration as "Xh Ym" never "Xm" which looks like metres
function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }
  return `${mins} min` // always append "min" not just "m"
}

function addMins(base: string, add: number): string {
  const [h, m] = base.split(':').map(Number)
  const total = h * 60 + m + add
  const rh = Math.floor(total / 60) % 24
  const rm = total % 60
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`
}

export default function BusDetail() {
  const { t } = useLang()
  const nav = useNavigate()
  const { id: routeNo } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const busId = params.get('bus')

  const [route, setRoute]     = useState<RouteInfo | null>(null)
  const [stops, setStops]     = useState<Stop[]>([])
  const [buses, setBuses]     = useState<BusRow[]>([])
  const [selBus, setSelBus]   = useState<BusRow | null>(null)
  const [lastSync, setLastSync] = useState(0)
  const [loading, setLoading] = useState(true)
  const [booked, setBooked]   = useState(false)

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
        const running = bRes.data.find(b => b.status === 'running') || bRes.data[0]
        setSelBus(prev => {
          // If same bus, update its data but keep selection
          if (prev && running && prev.id === running.id) return running
          return running || null
        })
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
    <div className="phone-shell">
       <StatusBar />
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--mute)' }}>Loading route...</div>
    </div>
  )

  if (!route) return (
    <div className="phone-shell">
    <StatusBar />
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Route not found</div>
        <button className="btn-primary" onClick={() => nav(-1)}>← Go Back</button>
      </div>
    </div>
  )

  const currentIdx = selBus?.current_stop_index ?? 1
  const capacity   = route.capacity
  const occupied   = selBus?.seats_occupied ?? 0
  const occPct     = Math.min(100, Math.round((occupied / capacity) * 100))
  const seatsLeft  = capacity - occupied

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

  const R    = 28
  const circ = 2 * Math.PI * R
  const offset = circ - (occPct / 100) * circ

  return (
    <div className="phone-shell">
      <div className="status-bar">
      <StatusBar />
        <span>APSRTC APCityPrayaanam • 4G</span>
      </div>

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
          <div style={{ background: '#FFF8E1', color: '#9A6700', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            APSRTC
          </div>
          {/* FIX: use formatDuration instead of raw mins */}
          <div style={{ background: '#E8F5E9', color: '#1A7A4A', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            {formatDuration(route.duration_mins)}
          </div>
          <div style={{ background: statusInfo.bg, color: statusInfo.color, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
            {selBus?.status === 'running' && <span className="live-dot" style={{ width: 5, height: 5, marginRight: 3 }} />}
            {statusInfo.label}
          </div>
        </div>
      </div>

      {/* BUS SELECTOR */}
      {buses.length > 1 && (
        <div style={{ background: 'white', padding: '10px 14px', borderBottom: '1px solid #EEF2F8' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Select bus — {buses.length} available
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {buses.map(b => (
              <button key={b.id} onClick={() => setSelBus(b)} style={{
                padding: '5px 12px', borderRadius: 20,
                border: `1.5px solid ${selBus?.id === b.id ? 'var(--blue)' : '#E2E8F0'}`,
                background: selBus?.id === b.id ? 'var(--blue)' : 'white',
                color: selBus?.id === b.id ? 'white' : 'var(--text)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {b.registration} · {b.departure_time}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SCROLLABLE */}
      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 220px)' }}>

        {/* ROUTE TRACKER */}
        <div style={{ background: 'white', margin: 14, borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🚌 {t('liveRoute')} — Bus Position & Stops</span>
            <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>LIVE · {lastSync}s AGO</span>
          </div>

          {stops.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--mute)', fontSize: 13 }}>
              Stop data loading...
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 44 }}>
              {stops.map((stop, idx) => {
                const isLast        = idx === stops.length - 1
                const isPassed      = stop.stop_index < currentIdx
                const isCurrent     = stop.stop_index === currentIdx
                const isFirst       = idx === 0
                const isDestination = isLast

                // FIX: compute per-stop time correctly
                const segMins = idx === 0
                  ? 0
                  : Math.round((route.duration_mins / Math.max(stops.length - 1, 1)) * idx)
                const stopTime = selBus
                  ? addMins(selBus.departure_time, segMins + (selBus.delay_mins || 0))
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
                } else if (isFirst) {
                  circleStyle = { ...circleStyle, background: '#FFF3E0', borderColor: '#F5A623', borderWidth: 3 }
                  nameStyle = { ...nameStyle, fontWeight: 600, color: '#9A6700' }
                  badge = <span style={{ display: 'inline-block', background: '#F5A623', color: 'var(--blue)', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 6, verticalAlign: 'middle' }}>📍 {t('yourStop')}</span>
                } else if (isDestination) {
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
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
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
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>Derived from ePoS ticket data</div>
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
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
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

        {/* DRIVER INFO */}
        {selBus?.driver_name && (
          <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
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
