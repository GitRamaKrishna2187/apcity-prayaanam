import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'

export default function Profile() {
  const nav = useNavigate()
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  const [profile, setProfile] = useState({
    name: 'BVASSR KRISHNA',
    mobile: '9848032919',
    email: 'bvassr.krishna@apgov.in',
    aadhaar: 'XXXX XXXX 6789',
    dob: '1985-06-15',
    gender: 'Male',
    address: 'Flat 4B, Visakha Towers, MVP Colony, Visakhapatnam - 530017',
    preferredRoute: '900R — RTC Complex to Rushikonda',
    language: 'English',
    notifications: true,
    upiId: 'bvassr@okaxis',
  })

  const getIST = () => new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
  })
  const [time] = useState(getIST())

  const handleSave = () => {
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="phone-shell screen-enter">
      {/* Status bar */}
      <div className="status-bar">
        <span>{time}</span>
        <span>APSRTC APCityPrayaanam • 4G</span>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--blue)', padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => nav(-1)} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: 'white', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>←</button>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white' }}>
            My Profile
          </div>
          <button onClick={() => editing ? handleSave() : setEditing(true)}
            style={{
              marginLeft: 'auto', background: editing ? 'var(--gold)' : 'rgba(255,255,255,0.15)',
              border: 'none', color: editing ? 'var(--blue)' : 'white',
              fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700,
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
            }}>
            {editing ? '✓ SAVE' : '✏ EDIT'}
          </button>
        </div>
      </div>

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>

        {/* Saved toast */}
        {saved && (
          <div style={{
            margin: '12px 14px 0', background: '#E8F5E9', border: '1px solid var(--green)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 600,
          }}>
            ✓ Profile saved successfully
          </div>
        )}

        {/* Avatar card */}
        <div style={{ margin: '14px 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--blue)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white',
              fontFamily: 'Rajdhani,sans-serif', flexShrink: 0,
            }}>BK</div>
            <div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {profile.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{profile.mobile}</div>
              <div style={{ marginTop: 6 }}>
                <span style={{
                  background: '#E8F5E9', color: 'var(--green)', fontSize: 10,
                  fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                }}>✓ Aadhaar Verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* Personal details */}
        <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
            Personal Details
          </div>

          {[
            { label: 'Full Name', key: 'name', type: 'text' },
            { label: 'Mobile Number', key: 'mobile', type: 'tel' },
            { label: 'Email Address', key: 'email', type: 'email' },
            { label: 'Aadhaar Number', key: 'aadhaar', type: 'text', readonly: true },
            { label: 'Date of Birth', key: 'dob', type: 'date' },
          ].map(({ label, key, type, readonly }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
              {editing && !readonly ? (
                <input
                  type={type}
                  value={(profile as any)[key]}
                  onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                  className="form-input"
                />
              ) : (
                <div style={{ fontSize: 14, color: readonly ? 'var(--mute)' : 'var(--text)', padding: '9px 0', borderBottom: '1px solid #F0F4FA' }}>
                  {(profile as any)[key]}
                  {readonly && <span style={{ fontSize: 10, color: 'var(--mute)', marginLeft: 6 }}>(cannot edit)</span>}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Gender</div>
            {editing ? (
              <select className="form-input" value={profile.gender} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text)', padding: '9px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.gender}</div>
            )}
          </div>

          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Address</div>
            {editing ? (
              <textarea className="form-input" rows={3}
                value={profile.address}
                onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                style={{ resize: 'none' }}
              />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '9px 0' }}>{profile.address}</div>
            )}
          </div>
        </div>

        {/* Travel preferences */}
        <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
            Travel Preferences
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Preferred Route</div>
            {editing ? (
              <select className="form-input" value={profile.preferredRoute} onChange={e => setProfile(p => ({ ...p, preferredRoute: e.target.value }))}>
                <option>900R — RTC Complex to Rushikonda</option>
                <option>400 — RTC Complex to Gajuwaka</option>
                <option>38J — RTC Complex to Janata Colony</option>
                <option>60R — Simhachalam to MVP Colony</option>
                <option>10K — RTC Complex to Kailasagiri</option>
              </select>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', padding: '9px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.preferredRoute}</div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>App Language</div>
            {editing ? (
              <select className="form-input" value={profile.language} onChange={e => setProfile(p => ({ ...p, language: e.target.value }))}>
                <option>English</option><option>Telugu</option><option>Hindi</option>
              </select>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', padding: '9px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.language}</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Bus arrival notifications</div>
              <div style={{ fontSize: 11, color: 'var(--mute)' }}>Alert 5 min before bus arrives at your stop</div>
            </div>
            <div
              onClick={() => editing && setProfile(p => ({ ...p, notifications: !p.notifications }))}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: profile.notifications ? 'var(--green)' : '#E2E8F0',
                position: 'relative', cursor: editing ? 'pointer' : 'default',
                transition: 'background 0.2s', flexShrink: 0,
              }}>
              <div style={{
                position: 'absolute', top: 2, left: profile.notifications ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: 'white',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div style={{ margin: '0 14px 10px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
            Payment & ePass
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>UPI ID</div>
            {editing ? (
              <input type="text" className="form-input" value={profile.upiId} onChange={e => setProfile(p => ({ ...p, upiId: e.target.value }))} />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', padding: '9px 0', borderBottom: '1px solid #F0F4FA' }}>{profile.upiId}</div>
            )}
          </div>
          <button onClick={() => nav('/epass')} style={{
            width: '100%', padding: '11px', background: 'var(--light)', color: 'var(--blue)',
            border: '1.5px solid var(--blue)', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            🪪 View My ePass
          </button>
        </div>

        {/* Logout */}
        <div style={{ margin: '0 14px 20px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <button style={{
            width: '100%', padding: '11px', background: 'white', color: '#C0392B',
            border: '1.5px solid #C0392B', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            Sign Out
          </button>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--mute)', marginTop: 10 }}>
            APCityPrayaanam v1.0 · APSRTC © 2025
          </div>
        </div>

      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {[['🏠','Home','/'],['🚌','Buses','/buses'],['🪪','ePass','/epass'],['⏰','Timetable','/timetable'],['👤','Profile','/profile']].map(([icon, label, path], i) => (
          <button key={i} className={`nav-item${path === '/profile' ? ' active' : ''}`} onClick={() => nav(path as string)}>
            <div className="nav-icon">{icon}</div>
            {path === '/profile' && <div className="nav-dot" />}
            <div className="nav-label" style={path === '/profile' ? { color: 'var(--blue)' } : {}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

