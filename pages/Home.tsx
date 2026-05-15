import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import type { Language } from '../i18n/LanguageContext'

interface Stop { stop_name: string; city: string }
interface Announcement { id: string; message: string; type: string }
interface RecentSearch { from: string; to: string; date: string; count: number }

const POPULAR_ROUTES = ['900R','400','38J','10K','60R','500P','99K','6H']
const RECENT_KEY = 'apcity-recent-searches'

export default function Home() {
  const { t, lang, setLang } = useLang()
  const nav = useNavigate()

  const [mode, setMode] = useState<'stops'|'route'>('stops')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [routeNo, setRouteNo] = useState('')
  const [fromSugg, setFromSugg] = useState<Stop[]>([])
  const [toSugg, setToSugg] = useState<Stop[]>([])
  const [fromFocus, setFromFocus] = useState(false)
  const [toFocus, setToFocus] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [showLang, setShowLang] = useState(false)
  const [annIdx, setAnnIdx] = useState(0)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('announcements').select('id,message,type')
      .eq('active', true).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAnnouncements(data) })
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) setRecentSearches(JSON.parse(raw).slice(0, 3))
    } catch {}
  }, [])

  useEffect(() => {
    if (announcements.length <= 1) return
    const timer = setInterval(() => setAnnIdx(i => (i + 1) % announcements.length), 4000)
    return () => clearInterval(timer)
  }, [announcements])

  async function fetchSugg(q: string, setter: (s: Stop[]) => void) {
    if (q.length < 2) { setter([]); return }
    const { data } = await supabase.from('bus_stops')
      .select('stop_name,city').ilike('stop_name', `%${q}%`).limit(6)
    if (data) {
      const unique = Array.from(new Map(data.map(s => [s.stop_name, s])).values())
      setter(unique)
    }
  }

  useEffect(() => { fetchSugg(from, setFromSugg) }, [from])
  useEffect(() => { fetchSugg(to, setToSugg) }, [to])

  function swap() { const tmp = from; setFrom(to); setTo(tmp) }

  function saveRecent(f: string, t2: string) {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      const prev: RecentSearch[] = raw ? JSON.parse(raw) : []
      const next = [
        { from: f, to: t2, date: 'Just now', count: Math.floor(Math.random() * 8) + 2 },
        ...prev.filter(r => !(r.from === f && r.to === t2))
      ].slice(0, 3)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      setRecentSearches(next)
    } catch {}
  }

  function search() {
    if (mode === 'route') {
      if (!routeNo.trim()) return
      nav(`/buses?route=${routeNo.trim().toUpperCase()}`)
    } else {
      if (!from.trim() || !to.trim()) return
      saveRecent(from.trim(), to.trim())
      nav(`/buses?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`)
    }
  }

  function pickRecent(r: RecentSearch) {
    setFrom(r.from); setTo(r.to); setMode('stops')
    nav(`/buses?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`)
  }

  const annColors: Record<string, string> = {
    info: '#1B3A6B', warning: '#854F0B', success: '#0F6E56'
  }
  const ann = announcements[annIdx]

  return (
    <div className="phone-shell">
      <div className="status-bar">
        <span>9:41 AM</span>
        <span>APCityPrayaanam • 4G</span>
      </div>

      <div className="app-header">
        <div className="header-top">
          <div>
            <div className="app-logo">
              AP <span>CITY</span>
              <span style={{ color: 'var(--gold)', fontSize: 13, marginLeft: 6, fontWeight: 600, letterSpacing: 2 }}>PRAYAANAM</span>
            </div>
            <span className="app-sub">
              {lang === 'te' ? 'ఏపీసిటీ ప్రయాణం' : lang === 'hi' ? 'एपीसिटी प्रयाणम' : 'APCity Prayaanam'}
            </span>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setShowLang(true)}
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              {lang === 'te' ? 'తె' : lang === 'hi' ? 'हि' : 'EN'}
            </button>
            <button className="icon-btn" style={{ fontSize: 16 }}>🔔</button>
          </div>
        </div>

        {/* SEARCH CARD */}
        <div style={{ background: 'white', borderRadius: 12, padding: 14, position: 'relative', boxShadow: '0 8px 32px rgba(13,43,94,0.15)' }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#F4F6FA', borderRadius: 8, padding: 3, marginBottom: 12 }}>
            {(['stops', 'route'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? 'var(--blue)' : 'var(--mute)',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
              }}>
                {m === 'stops' ? t('byStops') : t('byRoute')}
              </button>
            ))}
          </div>

          {mode === 'stops' ? (
            <>
              {/* FROM input */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E8F5E9', border: '2px solid #1A7A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1A7A4A', flexShrink: 0 }}>A</div>
                  <input ref={fromRef} className="form-input" value={from}
                    onChange={e => setFrom(e.target.value)}
                    onFocus={() => setFromFocus(true)}
                    onBlur={() => setTimeout(() => setFromFocus(false), 150)}
                    placeholder={t('from')} style={{ flex: 1 }} />
                </div>
                {fromFocus && fromSugg.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 40, right: 0, background: 'white', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, marginTop: 4, overflow: 'hidden' }}>
                    {fromSugg.map((s, i) => (
                      <div key={i} onMouseDown={() => { setFrom(s.stop_name); setFromSugg([]) }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F4F6FA', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>📍 {s.stop_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--mute)' }}>{s.city}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SWAP button */}
              <button onClick={swap} style={{
                position: 'absolute', right: 28,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--light)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--blue)', fontSize: 16, fontWeight: 700, zIndex: 5, marginTop: -4,
              }}>⇅</button>

              {/* TO input */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#FDECEA', border: '2px solid #C0392B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#C0392B', flexShrink: 0 }}>B</div>
                  <input ref={toRef} className="form-input" value={to}
                    onChange={e => setTo(e.target.value)}
                    onFocus={() => setToFocus(true)}
                    onBlur={() => setTimeout(() => setToFocus(false), 150)}
                    placeholder={t('to')} style={{ flex: 1 }} />
                </div>
                {toFocus && toSugg.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 40, right: 0, background: 'white', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, marginTop: 4, overflow: 'hidden' }}>
                    {toSugg.map((s, i) => (
                      <div key={i} onMouseDown={() => { setTo(s.stop_name); setToSugg([]) }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F4F6FA', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>📍 {s.stop_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--mute)' }}>{s.city}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
        )}

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <>
            <div style={{ padding: '0 14px 8px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('recentSearches')}
            </div>
            <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentSearches.map((r, i) => (
                <button key={i} onClick={() => pickRecent(r)} style={{
                  background: 'white', borderRadius: 10, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: 'var(--shadow)', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <span style={{ fontSize: 18 }}>🔄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.from} → {r.to}</div>
                    <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>{r.date} • {r.count} buses found</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>→</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Popular routes */}
        <div style={{ padding: '14px 14px 8px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Popular Routes — Vizag
        </div>
        <div style={{ padding: '0 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { no: '900R', name: 'RTC → Rushikonda' },
            { no: '400', name: 'RTC → Gajuwaka' },
            { no: '38J', name: 'Bheemunipatnam → Steel Plant' },
            { no: '60R', name: 'Simhachalam → MVP Colony' },
            { no: '22C', name: 'RTC → Airport' },
            { no: '10K', name: 'RTC → Maddilapalem' },
          ].map(r => (
            <button key={r.no} onClick={() => nav(`/buses?route=${r.no}`)} style={{
              background: 'white', borderRadius: 10, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: 'var(--shadow)', border: '1.5px solid #EEF2F8', cursor: 'pointer',
              width: 'calc(50% - 4px)', textAlign: 'left',
            }}>
              <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 6, minWidth: 40, textAlign: 'center' }}>{r.no}</div>
              <div style={{ fontSize: 11, color: 'var(--mute)', lineHeight: 1.3 }}>{r.name}</div>
            </button>
          ))}
        </div>

        <div style={{ height: 20 }} />
      </div>

      {/* LANGUAGE MODAL */}
      {showLang && (
        <div className="lang-modal-overlay" onClick={() => setShowLang(false)}>
          <div className="lang-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--blue)', marginBottom: 16, textAlign: 'center' }}>
              Select Language / భాష ఎంచుకోండి
            </div>
            {([
              { code: 'en' as Language, flag: '🇬🇧', name: 'English', native: 'English' },
              { code: 'te' as Language, flag: '🇮🇳', name: 'Telugu', native: 'తెలుగు' },
              { code: 'hi' as Language, flag: '🇮🇳', name: 'Hindi', native: 'हिंदी' },
            ]).map(l => (
              <div key={l.code} className={`lang-option${lang === l.code ? ' selected' : ''}`}
                onClick={() => { setLang(l.code); setShowLang(false) }}>
                <span className="lang-flag">{l.flag}</span>
                <div>
                  <div className="lang-name">{l.name}</div>
                  <div className="lang-native">{l.native}</div>
                </div>
                {lang === l.code && <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontSize: 18 }}>✓</span>}
              </div>
            ))}
            <button onClick={() => setShowLang(false)} style={{
              width: '100%', padding: '12px', background: '#F4F6FA', border: 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'var(--mute)', cursor: 'pointer', marginTop: 4,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="bottom-nav">
        {[
          { icon: '🏠', label: t('home'), path: '/' },
          { icon: '🚌', label: t('buses'), path: '/buses' },
          { icon: '🪪', label: t('epass'), path: '/epass' },
          { icon: '⏰', label: t('timetable'), path: '/timetable' },
          { icon: '👤', label: t('profile'), path: '/profile' },
        ].map((item, i) => (
          <button key={i} className={`nav-item${window.location.pathname === item.path ? ' active' : ''}`}
            onClick={() => nav(item.path)}>
            <div className="nav-icon">{item.icon}</div>
            {window.location.pathname === item.path && <div className="nav-dot" />}
            <div className="nav-label" style={window.location.pathname === item.path ? { color: 'var(--blue)' } : {}}>{item.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
