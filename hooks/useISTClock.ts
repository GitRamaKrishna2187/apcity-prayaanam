// ═══════════════════════════════════════════════════════════════
// IST CLOCK FIX — paste relevant sections into your app
// All times display as Indian Standard Time (Asia/Kolkata)
// ═══════════════════════════════════════════════════════════════

// ── 1. Add this hook to a new file: hooks/useISTClock.ts ────────
import { useState, useEffect } from 'react'

export function useISTClock() {
  const getIST = () => {
    const now = new Date()
    return {
      time: now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }),
      date: now.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      }),
      hour24: parseInt(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        })
      ),
    }
  }

  const [clock, setClock] = useState(getIST())

  useEffect(() => {
    const timer = setInterval(() => setClock(getIST()), 1000)
    return () => clearInterval(timer)
  }, [])

  return clock
}

// ── 2. Replace the status bar in every screen ────────────────────
// Find every occurrence of:
//   <span>9:41 AM</span>
// Replace with:
//   <ISTStatusBar />
//
// Add this component near the top of the file or in a shared components file:

import { useISTClock } from '../hooks/useISTClock'

export function ISTStatusBar() {
  const { time } = useISTClock()
  return (
    <div style={{
      background: 'var(--blue)',
      padding: '8px 16px 6px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500 }}>
        {time}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500 }}>
        APSRTC APCityPrayaanam • 4G
      </span>
    </div>
  )
}

// ── 3. Fix departure/arrival time display on bus cards ────────────
// The departure_time stored in Supabase is already in IST (HH:MM format)
// Convert it to 12-hour display format for passengers

export function formatISTTime(timeStr: string): string {
  if (!timeStr) return '--'
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// Usage on bus cards:
// Before:  <div className="time-main">{bus.departure_time}</div>
// After:   <div className="time-main">{formatISTTime(bus.departure_time)}</div>

// ── 4. Show "next bus" countdown in real IST time ─────────────────
export function minutesUntilDeparture(departureTime: string): string {
  const now = new Date()
  const [h, m] = departureTime.split(':').map(Number)

  // Get current IST time in minutes since midnight
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const nowMins = istNow.getHours() * 60 + istNow.getMinutes()
  const depMins = h * 60 + m
  const diff    = depMins - nowMins

  if (diff < 0)   return 'Departed'
  if (diff === 0) return 'Departing now'
  if (diff < 60)  return `${diff} min`
  const hrs = Math.floor(diff / 60)
  const rem = diff % 60
  return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`
}

// Usage on bus cards:
// Before:  <div className="next-bus-time">14 mins</div>
// After:   <div className="next-bus-time">{minutesUntilDeparture(bus.departure_time)}</div>

// ── 5. Timetable screen — highlight NEXT departure in IST ─────────
export function isNextDeparture(timeStr: string): boolean {
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const nowMins = istNow.getHours() * 60 + istNow.getMinutes()
  const [h, m]  = timeStr.split(':').map(Number)
  const depMins = h * 60 + m
  // Next departure = soonest future departure within next 2 hours
  return depMins > nowMins && depMins <= nowMins + 120
}

// Usage in timetable rows:
// style={{ background: isNextDeparture(slot.departure_time) ? '#EFF6FF' : 'white',
//          fontWeight: isNextDeparture(slot.departure_time) ? 700 : 400 }}

// ── 6. Occupancy label reflects time of day ───────────────────────
export function getOccupancyContext(): string {
  const now  = new Date()
  const istH = parseInt(new Date(now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata'
  })).getHours().toString())

  if (istH >= 6 && istH <= 9)   return 'Peak morning hours — buses fill fast'
  if (istH >= 17 && istH <= 20) return 'Peak evening hours — buses fill fast'
  if (istH >= 22 || istH < 5)   return 'Night service — limited buses'
  return 'Off-peak hours — comfortable travel'
}

// Usage on home screen or bus results:
// <div style={{fontSize:11, color:'var(--mute)'}}>{getOccupancyContext()}</div>
