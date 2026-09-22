import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  QRCode, useRotatingCode, CodeExpiryBar,
  loadTicketCreds, saveTicketCred,
} from '../lib/credential'
import type { TicketCred } from '../lib/credential'

// ─────────────────────────────────────────────────────────────────────────────
// e-Ticket — single-journey ticketing, aimed at the Green Metro AC / airport
// services where passengers pay a premium fare and an ePass is the wrong
// product (occasional riders, not monthly commuters).
// ─────────────────────────────────────────────────────────────────────────────

// Replace with the APSRTC depot's actual collection VPA before any pilot.
const APSRTC_VPA = 'apsrtc.vizag@upi'

type Step = 'search' | 'routes' | 'pay' | 'ticket' | 'list'

type Quote = {
  ok: boolean; reason?: string
  route_no: string; route_name: string; bus_type: string; bus_label: string; ac: boolean
  from_stop: string; to_stop: string; distance_km: number
  fare_each: number; passengers: number; total_fare: number
}

const TYPE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  metro_luxury:  { bg: '#E8F5E9', fg: '#1A7A4A', icon: '⚡' },
  metro_express: { bg: '#EBF2FF', fg: '#1B3A6B', icon: '🚌' },
  city_ordinary: { bg: '#F4F6FA', fg: '#7A8BA6', icon: '🚏' },
}

function fmtTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

// ── Stop autocomplete ────────────────────────────────────────────────────────
function StopField({ label, labelTe, value, onChange, dotColor, dotLetter }: {
  label: string; labelTe: string; value: string
  onChange: (v: string) => void; dotColor: string; dotLetter: string
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (value.trim().length < 2) { setSuggestions([]); return }
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('bus_stops')
        .select('stop_name')
        .ilike('stop_name', `%${value.trim()}%`)
        .limit(40)
      if (!alive) return
      // bus_stops is a view over route_stops, so a stop serving eight routes
      // returns eight rows. Collapse to distinct names.
      setSuggestions([...new Set((data || []).map(r => r.stop_name))].slice(0, 6))
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [value])

  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <label className="form-label">{label} · {labelTe}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${dotColor}`, color: dotColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
        }}>{dotLetter}</div>
        <input
          type="text" className="form-input" value={value}
          placeholder="Start typing a stop name"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, left: 39, right: 0, top: '100%',
          background: 'white', borderRadius: 8, boxShadow: 'var(--shadow-lg)',
          border: '1px solid #E2E8F0', overflow: 'hidden',
        }}>
          {suggestions.map(s => (
            <div key={s} onMouseDown={() => { onChange(s); setOpen(false) }}
              style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #F4F6FA' }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── The issued ticket, as a card ─────────────────────────────────────────────
// A ticket is live only while it is 'issued' AND inside its window. The status
// alone is not enough: a ticket nobody scanned stays 'issued' in the table until
// the cron sweep runs, and rotating a code for it in the meantime shows a
// credential as usable after it has stopped being valid.
function isLive(t: any) {
  return t.status === 'issued' && (!t.valid_until || new Date(t.valid_until) > new Date())
}

function TicketCard({ t }: { t: any }) {
  // The server also withholds qr_secret for anything not live, so this is belt
  // and braces rather than the only guard.
  const { code, remaining, unsupported } = useRotatingCode(isLive(t) ? t.qr_secret : null)
  const style = TYPE_STYLE[t.bus_type] || TYPE_STYLE.city_ordinary

  const onBoard   = t.status === 'used'
  const completed = t.status === 'completed'
  const expired   = t.status === 'expired' ||
                    (t.status === 'issued' && t.valid_until && new Date(t.valid_until) < new Date())
  const done      = onBoard || completed || expired

  const state = completed ? { label: 'TRAVEL COMPLETED', te: 'ప్రయాణం పూర్తయింది', bg: '#5A6B85', icon: '🏁' }
    : onBoard  ? { label: 'ON BOARD',  te: 'ప్రయాణంలో',      bg: '#1A7A4A', icon: '🚌' }
    : expired  ? { label: 'EXPIRED',   te: 'గడువు ముగిసింది', bg: '#7A8BA6', icon: '⌛' }
    :            { label: 'VALID',     te: 'చెల్లుబాటు',      bg: 'var(--gold)', icon: '🎟️' }

  return (
    <div style={{
      margin: 14, background: 'white', borderRadius: 14, overflow: 'hidden',
      border: '1px solid #C9D6EC', boxShadow: '0 8px 24px rgba(13,43,94,0.16)',
      opacity: completed || expired ? 0.7 : 1,
    }}>
      <div style={{
        background: completed || expired
          ? 'linear-gradient(135deg,#6B7A90,#8494A8)'
          : 'linear-gradient(135deg, var(--blue) 0%, #12305C 100%)',
        padding: '10px 14px', borderBottom: '3px solid var(--gold)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: 0.5 }}>
            APSRTC e-TICKET
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>ఏపీఎస్ఆర్టీసీ ఈ-టికెట్</div>
        </div>
        <div style={{
          background: state.bg,
          color: state.bg === 'var(--gold)' ? 'var(--blue)' : 'white',
          fontSize: 9.5, fontWeight: 800, padding: '4px 9px', borderRadius: 4,
          textAlign: 'right', lineHeight: 1.3,
        }}>
          <div>{state.label}</div>
          <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.85 }}>{state.te}</div>
        </div>
      </div>

      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            background: style.bg, color: style.fg, fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
          }}>{style.icon} {t.route_no}</div>
          <div style={{ fontSize: 12, color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.route_name}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: 0.4 }}>FROM · నుండి</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.from_stop}</div>
          </div>
          <div style={{ color: 'var(--blue)', fontSize: 16 }}>→</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: 0.4 }}>TO · వరకు</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.to_stop}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          {[
            ['PASSENGERS', String(t.passengers)],
            ['DISTANCE', `${t.distance_km} km`],
            ['FARE PAID', `₹${t.total_fare}`],
            completed ? ['ARRIVED ~', fmtTime(t.expected_arrival)]
              : onBoard ? ['ARRIVING ~', fmtTime(t.expected_arrival)]
              : ['VALID TILL', fmtTime(t.valid_until)],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ fontSize: 7.5, color: 'var(--mute)', letterSpacing: 0.4 }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          borderTop: '1px dashed #D8E1F0', paddingTop: 12,
        }}>
          {done ? (
            <div style={{
              width: 76, height: 76, borderRadius: 6, background: '#F4F6FA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, flexShrink: 0,
            }}>{completed ? '🏁' : onBoard ? '✓' : '⌛'}</div>
          ) : (
            <div style={{ position: 'relative', flexShrink: 0, padding: 3, background: 'white', border: '1px solid #D8E1F0', borderRadius: 6 }}>
              <QRCode value={`${t.ticket_no}|${code || '000000'}`} size={70} />
              <CodeExpiryBar remaining={remaining} />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: 0.4 }}>TICKET NO · టికెట్ నంబర్</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              {t.ticket_no}
            </div>
            {!done && (
              <div style={{
                fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: 2,
                color: unsupported ? 'var(--red)' : 'var(--blue)', marginTop: 2,
              }}>
                {unsupported ? 'CODE UNAVAILABLE' : (code || '••••••')}
                {!unsupported && code && (
                  <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0, color: 'var(--mute)', marginLeft: 5 }}>
                    {remaining}s
                  </span>
                )}
              </div>
            )}
            <div style={{
              fontSize: 9.5, marginTop: 3, lineHeight: 1.4,
              color: completed ? 'var(--mute)' : onBoard ? 'var(--green)' : expired ? 'var(--mute)' : 'var(--mute)',
            }}>
              {completed
                ? `Journey finished${t.used_bus ? ` on bus ${t.used_bus}` : ''}. Kept for your records.`
                : onBoard
                ? `Boarded at ${fmtTime(t.used_at)}${t.used_bus ? ` on bus ${t.used_bus}` : ''} — arriving around ${fmtTime(t.expected_arrival)}.`
                : expired
                ? 'Never boarded. The validity window closed.'
                : 'Valid for one boarding only. The conductor scans this once.'}
            </div>
          </div>
        </div>

        {!t.payment_verified && !done && (
          <div style={{
            marginTop: 10, background: '#FFF8E1', border: '1px solid #FFD54F',
            borderRadius: 7, padding: '7px 10px', fontSize: 10, color: '#78550A', lineHeight: 1.5,
          }}>
            ⚠ Payment not confirmed by a bank callback. In this build the app marks
            payment itself — a live deployment must receive this from the payment provider.
          </div>
        )}
      </div>
    </div>
  )
}

export default function Tickets() {
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('search')

  const getIST = () => new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
  const [time, setTime] = useState(getIST())
  useEffect(() => {
    const tk = setInterval(() => setTime(getIST()), 1000)
    return () => clearInterval(tk)
  }, [])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [mobile, setMobile] = useState('')

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [chosen, setChosen] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [pending, setPending] = useState<{ ticketNo: string; token: string; total: number } | null>(null)
  const [ticket, setTicket] = useState<any>(null)
  const [myTickets, setMyTickets] = useState<any[]>([])

  // ── Find routes serving both stops, then price each ───────────────────────
  const searchRoutes = async () => {
    setErr('')
    if (!from.trim() || !to.trim()) { setErr('Enter both the boarding and destination stop.'); return }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      setErr('Boarding and destination stops are the same.'); return
    }
    setBusy(true)
    try {
      const [f, t] = await Promise.all([
        supabase.from('bus_stops').select('route_no,stop_index').ilike('stop_name', `%${from.trim()}%`),
        supabase.from('bus_stops').select('route_no,stop_index').ilike('stop_name', `%${to.trim()}%`),
      ])
      const fromIdx = new Map<string, number>()
      ;(f.data || []).forEach(r => fromIdx.set(r.route_no, r.stop_index))
      // A route only serves this journey if the destination comes after the
      // boarding stop in its stop order — otherwise it runs the other way.
      const candidates = [...new Set((t.data || [])
        .filter(r => fromIdx.has(r.route_no) && r.stop_index > (fromIdx.get(r.route_no) as number))
        .map(r => r.route_no))]

      if (!candidates.length) {
        setQuotes([])
        setErr('No direct service found between those stops. Try a nearby landmark, or check the route list.')
        setBusy(false)
        return
      }

      const priced = await Promise.all(candidates.slice(0, 8).map(async rn => {
        const { data } = await supabase.rpc('quote_fare', {
          p_route: rn, p_from: from.trim(), p_to: to.trim(), p_passengers: passengers,
        })
        return data as Quote
      }))

      const ok = priced.filter(q => q && q.ok)
      if (!ok.length) {
        setErr(priced.find(q => q && q.reason)?.reason || 'Could not price this journey.')
      }
      // Premium services first — they are the reason ticketing exists.
      const rank: Record<string, number> = { metro_luxury: 0, metro_express: 1, city_ordinary: 2 }
      ok.sort((a, b) => (rank[a.bus_type] ?? 9) - (rank[b.bus_type] ?? 9) || a.fare_each - b.fare_each)
      setQuotes(ok)
      if (ok.length) setStep('routes')
    } finally { setBusy(false) }
  }

  // ── Create the ticket, then hand off to UPI ───────────────────────────────
  const startPayment = async (q: Quote) => {
    setErr(''); setBusy(true)
    try {
      const { data, error } = await supabase.rpc('issue_ticket', {
        p_route: q.route_no, p_from: q.from_stop, p_to: q.to_stop,
        p_passengers: passengers, p_mobile: mobile || null,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.reason || 'Could not create the ticket.')
      setChosen(q)
      setPending({ ticketNo: data.ticket_no, token: data.access_token, total: Number(data.total_fare) })
      setStep('pay')
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally { setBusy(false) }
  }

  const upiLink = pending
    ? `upi://pay?pa=${encodeURIComponent(APSRTC_VPA)}&pn=${encodeURIComponent('APSRTC Visakhapatnam')}`
      + `&am=${pending.total}&cu=INR&tn=${encodeURIComponent(pending.ticketNo)}`
    : ''

  const confirmPayment = async () => {
    if (!pending) return
    setErr(''); setBusy(true)
    try {
      const { data, error } = await supabase.rpc('confirm_ticket_payment', {
        p_ticket_no: pending.ticketNo, p_token: pending.token,
        p_method: 'UPI', p_ref: null, p_verified: false,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.reason || 'Could not confirm payment.')

      saveTicketCred({ ticketNo: pending.ticketNo, token: pending.token })
      const { data: full } = await supabase.rpc('get_my_ticket', {
        p_ticket_no: pending.ticketNo, p_token: pending.token,
      })
      setTicket(full?.[0] || null)
      setStep('ticket')
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally { setBusy(false) }
  }

  // ── My tickets ────────────────────────────────────────────────────────────
  const refreshMyTickets = async () => {
    const creds: TicketCred[] = loadTicketCreds()
    const rows = await Promise.all(creds.map(async c => {
      const { data } = await supabase.rpc('get_my_ticket', {
        p_ticket_no: c.ticketNo, p_token: c.token,
      })
      return data?.[0] || null
    }))
    // Anything still in play first; finished journeys sink to the bottom.
    const rank: Record<string, number> = { issued: 0, used: 1, completed: 2, expired: 3, cancelled: 4 }
    const sorted = rows.filter(Boolean).sort((a: any, b: any) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime())
    setMyTickets(sorted)
    return sorted
  }

  const openMyTickets = async () => {
    setStep('list'); setBusy(true)
    await refreshMyTickets()
    setBusy(false)
  }

  // While a ticket is live or the passenger is on board, the wallet polls so the
  // card retires itself at arrival instead of sitting there looking current.
  useEffect(() => {
    if (step !== 'list') return
    const anyActive = myTickets.some((t: any) => t.status === 'issued' || t.status === 'used')
    if (!anyActive) return
    const i = setInterval(refreshMyTickets, 30000)
    return () => clearInterval(i)
  }, [step, myTickets])

  const Header = ({ title, te, back }: { title: string; te: string; back: () => void }) => (
    <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={back} style={{
          width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          border: 'none', color: 'white', fontSize: 16, cursor: 'pointer',
        }}>←</button>
        <div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'white' }}>{title}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{te}</div>
        </div>
      </div>
    </div>
  )

  const ErrBox = () => err ? (
    <div style={{
      margin: '0 14px 12px', background: '#FDECEA', border: '1px solid #EF9A9A',
      borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#C0392B', lineHeight: 1.5,
    }}>⚠ {err}</div>
  ) : null

  // ══ ISSUED TICKET ═══════════════════════════════════════════════════════════
  if (step === 'ticket' && ticket) {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>
        <Header title="Your e-Ticket" te="మీ ఈ-టికెట్" back={() => { setStep('search'); setTicket(null) }} />
        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>
          <div style={{
            margin: '14px 14px 0', background: '#E8F5E9', border: '1.5px solid var(--green)',
            borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#2E7D32', lineHeight: 1.5,
          }}>
            ✅ Ticket issued. Show the QR to the conductor when you board — it is
            accepted once and then permanently marked used.
          </div>
          <TicketCard t={ticket} />
          <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" onClick={openMyTickets}>📋 My Tickets</button>
            <button style={{
              width: '100%', padding: 12, background: 'var(--light)', color: 'var(--blue)',
              border: '1.5px solid var(--blue)', borderRadius: 10,
              fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }} onClick={() => { setStep('search'); setTicket(null); setFrom(''); setTo('') }}>
              + Book Another Ticket
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ══ MY TICKETS ══════════════════════════════════════════════════════════════
  if (step === 'list') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>
        <Header title="My Tickets" te="నా టికెట్లు" back={() => setStep('search')} />
        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>
          {busy && <div style={{ padding: 30, textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>Loading…</div>}
          {!busy && !myTickets.length && (
            <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🎟️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No tickets yet</div>
              <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
                Tickets are stored on this device only. Clearing your browser removes them.
              </div>
            </div>
          )}
          {(() => {
            const active = myTickets.filter((t: any) => t.status === 'issued' || t.status === 'used')
            const past   = myTickets.filter((t: any) => !(t.status === 'issued' || t.status === 'used'))
            const Heading = ({ text, te }: { text: string; te: string }) => (
              <div style={{
                padding: '4px 14px 2px', fontSize: 11, fontWeight: 700, color: 'var(--mute)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>{text} · <span style={{ textTransform: 'none', fontWeight: 600 }}>{te}</span></div>
            )
            return (
              <>
                {active.length > 0 && <Heading text="Active" te="ప్రస్తుతం" />}
                {active.map((t: any) => <TicketCard key={t.ticket_no} t={t} />)}
                {past.length > 0 && <Heading text="Past journeys" te="గత ప్రయాణాలు" />}
                {past.map((t: any) => <TicketCard key={t.ticket_no} t={t} />)}
              </>
            )
          })()}
          <div style={{ padding: '0 14px 20px' }}>
            <button className="btn-primary" onClick={() => setStep('search')}>+ Book a Ticket</button>
          </div>
        </div>
      </div>
    )
  }

  // ══ PAYMENT ═════════════════════════════════════════════════════════════════
  if (step === 'pay' && pending && chosen) {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>
        <Header title="Pay & Confirm" te="చెల్లింపు" back={() => setStep('routes')} />
        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>

          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Fare Summary
            </div>
            {[
              ['Route', `${chosen.route_no} — ${chosen.bus_label}`],
              ['Journey', `${chosen.from_stop} → ${chosen.to_stop}`],
              ['Distance', `${chosen.distance_km} km`],
              ['Fare per passenger', `₹${chosen.fare_each}`],
              ['Passengers', String(passengers)],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #F0F4FA' }}>
                <span style={{ fontSize: 12, color: 'var(--mute)' }}>{l}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span>
              <span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--blue)' }}>
                ₹{pending.total}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 8 }}>
              Ticket reference {pending.ticketNo} — quote the same reference in the UPI note.
            </div>
          </div>

          <ErrBox />

          <div style={{ margin: '0 14px 14px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <a href={upiLink} style={{ textDecoration: 'none' }}>
              <button className="btn-teal">📲 PAY ₹{pending.total} VIA UPI</button>
            </a>
            <div style={{ fontSize: 11, color: 'var(--mute)', margin: '10px 0', textAlign: 'center' }}>
              Opens GPay, PhonePe or any UPI app on this phone. Return here afterwards.
            </div>
            <button className="btn-primary" onClick={confirmPayment} disabled={busy}>
              {busy ? 'Confirming…' : '✓ I HAVE PAID — ISSUE TICKET'}
            </button>
          </div>

          <div style={{
            margin: '0 14px 20px', background: '#FFF8E1', border: '1px solid #FFD54F',
            borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#78550A', lineHeight: 1.5,
          }}>
            ⚠ <b>Demo payment flow.</b> This build takes the passenger's word that payment
            happened; no bank confirms it. Before carrying real fare revenue, the ticket must
            be issued by a payment-provider webhook, not by this button.
          </div>
        </div>
      </div>
    )
  }

  // ══ ROUTE / FARE OPTIONS ════════════════════════════════════════════════════
  if (step === 'routes') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>
        <Header title="Choose Service" te="సర్వీస్ ఎంచుకోండి" back={() => setStep('search')} />
        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>
          <div style={{
            margin: 14, background: 'white', borderRadius: 10, padding: '10px 14px',
            boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{from}</div>
            <div style={{ flex: 1, textAlign: 'center', color: 'var(--blue)' }}>→</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{to}</div>
          </div>

          <ErrBox />

          {quotes.map(q => {
            const st = TYPE_STYLE[q.bus_type] || TYPE_STYLE.city_ordinary
            return (
              <div key={q.route_no} style={{
                margin: '0 14px 10px', background: 'white', borderRadius: 12,
                boxShadow: 'var(--shadow)', overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    background: st.bg, color: st.fg, fontFamily: 'Rajdhani,sans-serif',
                    fontSize: 17, fontWeight: 700, padding: '5px 12px', borderRadius: 8, minWidth: 62, textAlign: 'center',
                  }}>{q.route_no}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{q.bus_label}</div>
                    <div style={{ fontSize: 11, color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.route_name} · {q.distance_km} km{q.ac ? ' · A/C' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>
                      ₹{q.total_fare}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--mute)' }}>
                      ₹{q.fare_each} × {passengers}
                    </div>
                  </div>
                </div>
                <button onClick={() => startPayment(q)} disabled={busy} style={{
                  width: '100%', padding: 11, background: 'var(--blue)', color: 'white',
                  border: 'none', fontFamily: 'Rajdhani,sans-serif', fontSize: 15,
                  fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
                }}>
                  {busy ? 'Please wait…' : 'BOOK THIS SERVICE →'}
                </button>
              </div>
            )
          })}
          <div style={{ height: 20 }} />
        </div>
      </div>
    )
  }

  // ══ SEARCH ══════════════════════════════════════════════════════════════════
  return (
    <div className="phone-shell screen-enter">
      <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>

      <div style={{ background: 'var(--blue)', padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white' }}>
              Book e-Ticket
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>ఈ-టికెట్ బుకింగ్</div>
          </div>
          <button onClick={openMyTickets} style={{
            background: 'rgba(255,255,255,0.14)', color: 'white', border: 'none',
            borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>📋 My Tickets</button>
        </div>
      </div>

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>
        <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <StopField label="FROM" labelTe="నుండి" value={from} onChange={setFrom}
            dotColor="var(--green)" dotLetter="A" />
          <StopField label="TO" labelTe="వరకు" value={to} onChange={setTo}
            dotColor="var(--red)" dotLetter="B" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '4px 0 12px' }}>
            <div>
              <label className="form-label">Passengers · ప్రయాణికులు</label>
              <select className="form-input" value={passengers}
                onChange={e => setPassengers(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Mobile (optional)</label>
              <input type="tel" inputMode="numeric" maxLength={10} className="form-input"
                placeholder="For ticket recovery" value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
          </div>

          <ErrBox />

          <button className="btn-primary" onClick={searchRoutes} disabled={busy}>
            {busy ? 'Checking fares…' : '🔍 FIND SERVICES & FARE'}
          </button>
        </div>

        <div style={{
          margin: '0 14px 14px', background: 'linear-gradient(135deg,#E8F5E9,#F1FAF3)',
          borderRadius: 12, padding: 14, borderLeft: '4px solid var(--green)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A7A4A', marginBottom: 4 }}>
            ⚡ Green Metro AC services
          </div>
          <div style={{ fontSize: 11.5, color: '#2E7D32', lineHeight: 1.6 }}>
            Fully electric, air-conditioned, 35 seats, CCTV and automatic doors. Buy a
            single journey without a monthly pass — best for occasional and airport trips.
          </div>
        </div>

        <div style={{ margin: '0 14px 20px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            How e-Ticket works
          </div>
          {[
            ['1️⃣', 'Pick your stops', 'Fare is calculated from the actual route distance between them'],
            ['2️⃣', 'Pay by UPI', 'No cash, no change, no paper ticket'],
            ['3️⃣', 'Show the QR once', 'The conductor scans it; the code rotates every 30 seconds'],
            ['4️⃣', 'Valid for 3 hours', 'One boarding only — a scanned ticket cannot be reused'],
          ].map(([icon, title, sub]) => (
            <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bottom-nav">
        {[['🏠','Home','/'],['🚌','Buses','/buses'],['🎟️','Ticket','/tickets'],
          ['🪪','ePass','/epass'],['⏰','Timetable','/timetable'],['👤','Profile','/profile']].map(([icon, label, path], i) => (
          <button key={i} className={`nav-item${path === '/tickets' ? ' active' : ''}`} onClick={() => nav(path as string)}>
            <div className="nav-icon">{icon}</div>
            {path === '/tickets' && <div className="nav-dot" />}
            <div className="nav-label" style={path === '/tickets' ? { color: 'var(--blue)' } : {}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
