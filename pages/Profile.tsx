import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusBar from './StatusBar'

export default function Profile() {
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'tickets'>('profile')

  const [profile, setProfile] = useState({
    name: 'BVASSR KRISHNA',
    mobile: '9848032919',
    email: 'bvassr.krishna@apgov.in',
    aadhaar: 'XXXX XXXX 6789',
    dob: '1995-06-15',
    gender: 'Male',
    address: 'Flat 4B, Visakha Towers, MVP Colony, Visakhapatnam – 530017',
    preferredRoute: '900R — RTC Complex to Rushikonda',
    language: 'English',
    notifications: true,
    upiId: 'bvassr@okaxis',
  })

  const tickets = [
    { id: 'TKT-2025-001', route: '900R', from: 'RTC Complex', to: 'Rushikonda', date: 'Today, 06:45 AM', fare: '₹22', status: 'Used' },
    { id: 'TKT-2025-002', route: '400', from: 'RTC Complex', to: 'Gajuwaka', date: 'Yesterday, 08:10 AM', fare: '₹18', status: 'Used' },
    { id: 'TKT-2025-003', route: '38J', from: 'MVP Colony', to: 'Steel Plant', date: '12 May, 07:30 AM', fare: '₹30', status: 'Used' },
    { id: 'TKT-2025-004', route: '60R', from: 'Simhachalam', to: 'MVP Colony', date: '11 May, 09:15 AM', fare: '₹14', status: 'Used' },
    { id: 'TKT-2025-005', route: '10K', from: 'RTC Complex', to: 'Kailashagiri', date: '10 May, 07:00 AM', fare: '₹25', status: 'Used' },
  ]

  function handleSave() {
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 3000)
  }

  type ProfileKey = keyof typeof profile

  return (
    <div className="phone-shell screen-enter">
      <StatusBar />

      {/* Header */}
      <div style={{ background: 'var(--blue)', padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12 }}>
          <button onClick={() => nav(-1)} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: 'white', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>←</button>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white', flex: 1 }}>
            My Profile
          </div>
          {activeTab === 'profile' && (
            <button onClick={() => editing ? handleSave() : setEditing(true)} style={{
              background: editing ? 'var(--gold)' : 'rgba(255,255,255,0.15)',
              border: 'none', color: editing ? 'var(--blue)' : 'white',
              fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700,
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
            }}>
              {editing ? '✓ SAVE' : '✏ EDIT'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {(['profile', 'tickets'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: activeTab === tab ? 'white' : 'rgba(255,255,255,0.5)',
              fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700,
              borderBottom: activeTab === tab ? '3px solid var(--gold)' : '3px solid transparent',
            }}>
              {tab === 'profile' ? '👤 Profile' : '🎫 My Tickets'}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 145px)' }}>

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <>
            {saved && (
              <div style={{ margin: '12px 14px 0', background: '#E8F5E9', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
                ✓ Profile saved successfully
              </div>
            )}

            {/* Avatar */}
            <div style={{ margin: '14px 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white', fontFamily: 'Rajdhani,sans-serif', flexShrink: 0 }}>BK</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>{profile.mobile}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ background: '#E8F5E9', color: 'var(--green)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>✓ Aadhaar Verified</span>
                </div>
              </div>
            </div>

            {/* Personal details */}
            <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 }}>Personal Details</div>
              {([
                { label: 'Full Name', key: 'name' as ProfileKey, type: 'text' },
                { label: 'Mobile Number', key: 'mobile' as ProfileKey, type: 'tel' },
                { label: 'Email Address', key: 'email' as ProfileKey, type: 'email' },
                { label: 'Aadhaar Number', key: 'aadhaar' as ProfileKey, type: 'text', readonly: true },
                { label: 'Date of Birth', key: 'dob' as ProfileKey, type: 'date' },
              ]).map(({ label, key, type, readonly }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
                  {editing && !readonly ? (
                    <input type={type} className="form-input"
                      value={profile[key] as string}
                      onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))} />
                  ) : (
                    <div style={{ fontSize: 13, color: readonly ? 'var(--mute)' : 'var(--text)', padding: '8px 0', borderBottom: '1px solid #F0F4FA' }}>
                      {profile[key] as string}
                      {readonly && <span style={{ fontSize: 10, color: 'var(--mute)', marginLeft: 6 }}>(cannot edit)</span>}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 }}>Gender</div>
                {editing ? (
                  <select className="form-input" value={profile.gender} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text)', padding: '8px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.gender}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 }}>Address</div>
                {editing ? (
                  <textarea className="form-input" rows={3} value={profile.address}
                    onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                    style={{ resize: 'none' }} />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '8px 0' }}>{profile.address}</div>
                )}
              </div>
            </div>

            {/* Preferences */}
            <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 }}>Travel Preferences</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 }}>Preferred Route</div>
                {editing ? (
                  <select className="form-input" value={profile.preferredRoute} onChange={e => setProfile(p => ({ ...p, preferredRoute: e.target.value }))}>
                    <option>900R — RTC Complex to Rushikonda</option>
                    <option>400 — RTC Complex to Gajuwaka</option>
                    <option>38J — RTC Complex to Janata Colony</option>
                    <option>60R — Simhachalam to MVP Colony</option>
                    <option>10K — RTC Complex to Kailashagiri</option>
                  </select>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text)', padding: '8px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.preferredRoute}</div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Bus arrival notifications</div>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>Alert 5 min before bus arrives</div>
                </div>
                <div onClick={() => editing && setProfile(p => ({ ...p, notifications: !p.notifications }))}
                  style={{ width: 44, height: 24, borderRadius: 12, background: profile.notifications ? 'var(--green)' : '#E2E8F0', position: 'relative', cursor: editing ? 'pointer' : 'default', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: profile.notifications ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 }}>Payment & ePass</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 }}>UPI ID</div>
                {editing ? (
                  <input type="text" className="form-input" value={profile.upiId} onChange={e => setProfile(p => ({ ...p, upiId: e.target.value }))} />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text)', padding: '8px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.upiId}</div>
                )}
              </div>
              <button onClick={() => nav('/epass')} style={{ width: '100%', padding: 11, background: 'var(--light)', color: 'var(--blue)', border: '1.5px solid var(--blue)', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                🪪 View My ePass
              </button>
            </div>

            {/* Sign out */}
            <div style={{ margin: '0 14px 20px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
              <button style={{ width: '100%', padding: 11, background: 'white', color: '#C0392B', border: '1.5px solid #C0392B', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Sign Out
              </button>
              <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--mute)', marginTop: 10 }}>APCityPrayaanam v1.0 · © 2025 APCityPrayaanam</div>
            </div>
          </>
        )}

        {/* ── TICKETS TAB ── */}
        {activeTab === 'tickets' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 14px 0' }}>
              {[{ label: 'Trips This Month', value: '18', icon: '🚌' }, { label: 'Total Spent', value: '₹396', icon: '💰' }].map(c => (
                <div key={c.label} style={{ background: 'white', borderRadius: 12, padding: '14px 12px', boxShadow: 'var(--shadow)', textAlign: 'center' as const }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{c.icon}</div>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--blue)' }}>{c.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 500 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>Recent Journeys</div>

            <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.map(tk => (
                <div key={tk.id} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ background: 'var(--blue)', color: 'white', fontFamily: 'Rajdhani,sans-serif', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{tk.route}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{tk.from} → {tk.to}</div>
                    </div>
                    <span style={{ background: '#E8F5E9', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>{tk.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--mute)' }}>🕐 {tk.date}</div>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--blue)' }}>{tk.fare}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 3, fontFamily: 'monospace' }}>{tk.id}</div>
                </div>
              ))}
            </div>

            <div style={{ margin: '12px 14px 20px', background: 'white', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)', textAlign: 'center' as const }}>
              <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 10 }}>Get a monthly ePass and save up to 40% on daily travel.</div>
              <button onClick={() => nav('/epass')} style={{ width: '100%', padding: 11, background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Get Monthly ePass →
              </button>
            </div>
          </>
        )}

      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {([['🏠','Home','/'],['🚌','Buses','/buses'],['🪪','ePass','/epass'],['⏰','Timetable','/timetable'],['👤','Profile','/profile']] as [string,string,string][]).map(([icon,label,path],i) => (
          <button key={i} className={`nav-item${path==='/profile'?' active':''}`} onClick={()=>nav(path)}>
            <div className="nav-icon">{icon}</div>
            {path==='/profile'&&<div className="nav-dot"/>}
            <div className="nav-label" style={path==='/profile'?{color:'var(--blue)'}:{}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
