import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'

// ── QR code generator (pure SVG, no library needed) ───────────────────────────
function QRCode({ value, size = 120 }: { value: string; size?: number }) {
  // Simple deterministic pattern from string hash — decorative QR for demo
  const hash = (s: string) => s.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
  const h = Math.abs(hash(value))
  const cells = 21
  const cellSize = size / cells
  const bits: boolean[][] = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      // Corner finder patterns
      const inCorner = (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)
      if (inCorner) {
        const br = r < 7 ? r : r - (cells - 7)
        const bc = c < 7 ? c : c - (cells - 7)
        if (br === 0 || br === 6 || bc === 0 || bc === 6) return true
        if (br >= 2 && br <= 4 && bc >= 2 && bc <= 4) return true
        return false
      }
      // Data area — pseudo-random from hash
      return ((h ^ (r * 31 + c * 17 + r * c)) & 1) === 1
    })
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <rect width={size} height={size} fill="white" />
      {bits.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize} height={cellSize} fill="#0D1B2A" /> : null
        )
      )}
    </svg>
  )
}

// ── Pass ID generator ──────────────────────────────────────────────────────────
function genPassId() {
  const year = new Date().getFullYear()
  const num = Math.floor(40000 + Math.random() * 9999)
  return `APTC-${year}-VSP-${num.toString().padStart(7, '0')}`
}

type Screen = 'view' | 'apply' | 'submitted'

export default function EPass() {
  const nav = useNavigate()
  const { t } = useLang()
  const [screen, setScreen] = useState<Screen>('view')
  const [passId] = useState(genPassId())
  const [existingPass, setExistingPass] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [passStatus, setPassStatus] = useState<'pending'|'active'|'rejected'>('pending')
  const [approvedAt, setApprovedAt] = useState<string>('')

  const getIST = () => new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
  })
  const [time, setTime] = useState(getIST())
  useEffect(() => {
    const t = setInterval(() => setTime(getIST()), 1000)
    return () => clearInterval(t)
  }, [])

  // Form state pre-filled with dummy details
  const [form, setForm] = useState({
    fullName: 'BVASSR KRISHNA',
    aadhaar: '',
    mobile: '9848032919',
    passType: 'monthly',
    route: 'Visakhapatnam — All Routes',
    cfmsId: '14815316',
    orgName: 'AP State Government — Visakhapatnam',
    payment: 'upi_autopay',
  })
  const [submitting, setSubmitting] = useState(false)

  // Check if user already has a pass
  useEffect(() => {
    async function checkPass() {
      const { data } = await supabase
        .from('epasses')
        .select('*')
        .eq('status', 'active')
        .limit(1)
      if (data && data.length > 0) setExistingPass(data[0])
      setLoading(false)
    }
    checkPass()
  }, [])

  // ── Poll Supabase every 10 seconds when on submitted screen ────────────────
  // Updates the QR badge from PENDING → ACTIVE (or REJECTED) once depot manager acts
  useEffect(() => {
    if (screen !== 'submitted') return
    
    async function pollStatus() {
      const { data } = await supabase
        .from('epasses')
        .select('status, pass_id, updated_at')
        .eq('pass_id', passId)
        .single()
      
      if (data) {
        setPassStatus(data.status as 'pending'|'active'|'rejected')
        if (data.status === 'active' || data.status === 'rejected') {
          const d = new Date(data.updated_at)
          setApprovedAt(d.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Asia/Kolkata'
          }))
        }
      }
    }

    // Poll immediately then every 10 seconds
    pollStatus()
    const interval = setInterval(pollStatus, 10000)
    return () => clearInterval(interval)
  }, [screen, passId])

  const handleSubmit = async () => {
    if (!form.aadhaar || form.aadhaar.length < 12) {
      alert('Please enter a valid 12-digit Aadhaar number')
      return
    }
    setSubmitting(true)
    // Insert into Supabase
    await supabase.from('epasses').insert({
      pass_id: passId,
      holder_name: form.fullName,
      aadhaar_last4: form.aadhaar.slice(-4),
      mobile: form.mobile,
      pass_type: form.passType,
      route: form.route,
      cfms_id: form.cfmsId,
      org_name: form.orgName,
      payment_method: form.payment,
      amount: form.passType === 'monthly' ? 350 : form.passType === 'student' ? 150 : form.passType === 'senior' ? 175 : 50,
      status: 'pending',
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      auto_renewal: form.payment === 'upi_autopay',
    })
    setSubmitting(false)
    setScreen('submitted')
  }

  const getAmountLabel = () => {
    const map: Record<string, string> = { monthly: '₹350', student: '₹150', senior: '₹175', daily: '₹50' }
    return map[form.passType] || '₹350'
  }

  if (loading) return (
    <div className="phone-shell">
      <div className="status-bar"><span>{time}</span><span>APSRTC APCityPrayaanam • 4G</span></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--mute)', fontSize: 13 }}>
        Loading...
      </div>
    </div>
  )

  // ── SUBMITTED CONFIRMATION SCREEN ──────────────────────────────────────────
  if (screen === 'submitted') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar">
          <span>{time}</span>
          <span>APSRTC APCityPrayaanam • 4G</span>
        </div>

        <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setScreen('view')} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              border: 'none', color: 'white', fontSize: 16, cursor: 'pointer',
            }}>←</button>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'white' }}>
              Application Submitted
            </div>
          </div>
        </div>

        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>

          {/* Dynamic banner — updates on approval */}
          <div style={{ 
            margin: 14, 
            background: passStatus === 'active' ? '#E8F5E9' : passStatus === 'rejected' ? '#FDECEA' : '#E8F5E9', 
            border: `1.5px solid ${passStatus === 'active' ? 'var(--green)' : passStatus === 'rejected' ? '#C0392B' : 'var(--green)'}`, 
            borderRadius: 12, padding: 16, textAlign: 'center' 
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>
              {passStatus === 'active' ? '🎉' : passStatus === 'rejected' ? '❌' : '✅'}
            </div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, 
                         color: passStatus === 'active' ? 'var(--green)' : passStatus === 'rejected' ? '#C0392B' : 'var(--green)', 
                         marginBottom: 6 }}>
              {passStatus === 'active' ? 'ePass Approved! Ready to Use.' : 
               passStatus === 'rejected' ? 'Application Rejected' :
               'Application Submitted Successfully!'}
            </div>
            <div style={{ fontSize: 13, color: passStatus === 'rejected' ? '#C0392B' : '#2E7D32', lineHeight: 1.6 }}>
              {passStatus === 'active' 
                ? `Your ePass was approved at ${approvedAt}. Show the QR code below to the conductor to board any APSRTC city bus.`
                : passStatus === 'rejected'
                ? 'Your application was rejected by the depot manager. Please check your details and apply again.'
                : 'Your ePass application is waiting for approval at the Depot Manager login. This page updates automatically every 10 seconds.'}
            </div>
          </div>

          {/* Status tracker */}
          <div style={{ margin: '0 14px 12px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Application Status</span>
              {passStatus === 'pending' && (
                <span style={{ fontSize: 10, color: '#4CAF50', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="live-dot" style={{ width: 6, height: 6 }}/>
                  Checking every 10s
                </span>
              )}
            </div>
            {[
              { 
                label: 'Application submitted', 
                sub: `${time} today`, 
                done: true,
                current: false
              },
              { 
                label: passStatus === 'active' ? 'Approved by Depot Manager' : 
                       passStatus === 'rejected' ? 'Rejected by Depot Manager' :
                       'Waiting for Depot Manager approval', 
                sub: passStatus === 'active' ? `Approved at ${approvedAt} — Madhurawada Depot` :
                     passStatus === 'rejected' ? `Rejected at ${approvedAt} — check SMS for reason` :
                     'Madhurawada Depot — Visakhapatnam',
                done: passStatus === 'active' || passStatus === 'rejected',
                current: passStatus === 'pending',
                rejected: passStatus === 'rejected',
              },
              { 
                label: passStatus === 'active' ? 'ePass activated — QR code is live' : 'ePass will be activated', 
                sub: passStatus === 'active' ? 'Scan the QR code above to board any APSRTC city bus' : 'QR code activates after depot manager approval',
                done: passStatus === 'active',
                current: false
              },
            ].map((step: any, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: i < arr.length - 1 ? 0 : 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: step.rejected ? '#C0392B' : step.done ? 'var(--green)' : step.current ? 'var(--gold)' : '#E2E8F0',
                    border: `2px solid ${step.rejected ? '#C0392B' : step.done ? 'var(--green)' : step.current ? 'var(--gold)' : '#D1DCF0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: step.done ? 'white' : step.current ? 'var(--blue)' : 'var(--mute)',
                    fontWeight: 700,
                  }}>
                    {step.rejected ? '✗' : step.done ? '✓' : step.current ? '⏳' : '○'}
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ width: 2, height: 28, background: step.done ? 'var(--green)' : '#E2E8F0', margin: '2px 0' }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < arr.length - 1 ? 12 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: step.current ? 700 : 500, color: step.current ? 'var(--blue)' : 'var(--text)' }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{step.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Application details */}
          <div style={{ margin: '0 14px 12px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Application Details
            </div>
            {[
              ['Applicant', form.fullName],
              ['Pass Type', form.passType.charAt(0).toUpperCase() + form.passType.slice(1) + ' Pass'],
              ['Route/Zone', form.route],
              ['Amount', getAmountLabel()],
              ['Payment', form.payment === 'upi_autopay' ? 'UPI Autopay' : 'UPI One-time'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F0F4FA' }}>
                <span style={{ fontSize: 12, color: 'var(--mute)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* QR CODE section */}
          <div style={{ margin: '0 14px 12px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
              Your ePass QR Code
            </div>

            {/* QR visual */}
            <div style={{
              display: 'inline-block', padding: 12, background: 'white',
              border: '2px solid var(--blue)', borderRadius: 12,
              boxShadow: '0 4px 16px rgba(27,58,107,0.12)', marginBottom: 10,
            }}>
              <QRCode value={passId} size={140} />
            </div>

            {/* Dynamic status badge — updates when depot manager approves */}
            {passStatus === 'active' ? (
              <div style={{
                display: 'inline-block', background: '#E8F5E9', color: '#1A7A4A',
                border: '1.5px solid #4CAF50', borderRadius: 20, fontSize: 11,
                fontWeight: 700, padding: '4px 14px', marginBottom: 10, marginLeft: 8,
              }}>
                ✅ APPROVED — PASS ACTIVE
              </div>
            ) : passStatus === 'rejected' ? (
              <div style={{
                display: 'inline-block', background: '#FDECEA', color: '#C0392B',
                border: '1.5px solid #EF9A9A', borderRadius: 20, fontSize: 11,
                fontWeight: 700, padding: '4px 14px', marginBottom: 10, marginLeft: 8,
              }}>
                ✗ APPLICATION REJECTED
              </div>
            ) : (
              <div style={{
                display: 'inline-block', background: '#FFF3E0', color: '#E65100',
                border: '1.5px solid #FFB74D', borderRadius: 20, fontSize: 11,
                fontWeight: 700, padding: '4px 14px', marginBottom: 10, marginLeft: 8,
              }}>
                ⏳ PENDING APPROVAL
              </div>
            )}

            <div style={{ marginTop: 6 }}>
              <div style={{
                fontFamily: 'Rajdhani,sans-serif', fontSize: 16, fontWeight: 700,
                color: 'var(--blue)', letterSpacing: 0.5,
              }}>
                e-Pass
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 13, color: 'var(--text)',
                fontWeight: 600, marginTop: 3, letterSpacing: 0.5,
              }}>
                {passId}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
                This QR will activate once the Depot Manager approves your application.
                Show this QR to the conductor after approval.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" onClick={() => nav('/')}>
              ← Back to Home
            </button>
            <button style={{
              width: '100%', padding: 12, background: 'var(--light)', color: 'var(--blue)',
              border: '1.5px solid var(--blue)', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }} onClick={() => setScreen('view')}>
              View My ePass
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── APPLY SCREEN ────────────────────────────────────────────────────────────
  if (screen === 'apply') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar">
          <span>{time}</span>
          <span>APSRTC APCityPrayaanam • 4G</span>
        </div>

        <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setScreen('view')} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              border: 'none', color: 'white', fontSize: 16, cursor: 'pointer',
            }}>←</button>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'white' }}>
              Register New ePass
            </div>
          </div>
        </div>

        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>
          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              Self-Registration — No Counter Visit Needed
            </div>

            {/* Full Name */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Full Name (as per Aadhaar)</label>
              <input type="text" className="form-input" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>

            {/* Aadhaar + Mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="form-label">Aadhaar (12 Digits)</label>
                <input type="number" className="form-input" placeholder="XXXX XXXX XXXX"
                  value={form.aadhaar} onChange={e => setForm(f => ({ ...f, aadhaar: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Mobile (10 Digits)</label>
                <input type="tel" className="form-input" value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
              </div>
            </div>

            {/* Pass Type */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Pass Type</label>
              <select className="form-input" value={form.passType} onChange={e => setForm(f => ({ ...f, passType: e.target.value }))}>
                <option value="monthly">Monthly Pass — ₹350</option>
                <option value="daily">Daily Pass — ₹50</option>
                <option value="student">Student Pass — ₹150</option>
                <option value="senior">Senior Citizen Pass — ₹175</option>
              </select>
            </div>

            {/* Route */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Route / Zone</label>
              <select className="form-input" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                <option>Visakhapatnam — All Routes</option>
                <option>Visakhapatnam — City Zone (North)</option>
                <option>Visakhapatnam — City Zone (South)</option>
                <option>900R — RTC Complex to Rushikonda only</option>
                <option>400 — RTC Complex to Gajuwaka only</option>
                <option>38J — RTC Complex to Janata Colony only</option>
              </select>
            </div>

            {/* CFMS ID */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">CFMS / Student ID</label>
              <input type="text" className="form-input" value={form.cfmsId}
                onChange={e => setForm(f => ({ ...f, cfmsId: e.target.value }))} />
              <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 3 }}>
                Comprehensive Financial Management System ID for AP govt employees
              </div>
            </div>

            {/* Org name */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Organization / College Name</label>
              <input type="text" className="form-input" value={form.orgName}
                onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} />
            </div>

            {/* Payment */}
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Payment Method</label>
              <select className="form-input" value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))}>
                <option value="upi_autopay">UPI Autopay (auto-renew monthly)</option>
                <option value="upi_onetime">UPI One-time</option>
                <option value="net_banking">Net Banking</option>
              </select>
            </div>

            {/* Verification note */}
            <div style={{ background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9A6700', marginBottom: 3 }}>
                ⏰ 24-Hour Online Verification
              </div>
              <div style={{ fontSize: 11, color: '#78550A' }}>
                Monthly passes require online verification. Your pass will be activated within 24 hours.
              </div>
            </div>

            <button className="btn-teal" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : '✓ SUBMIT FOR VERIFICATION'}
            </button>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', marginTop: 10 }}>
              Pass issued after Aadhaar OTP verification & Depot Manager approval.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── VIEW / ACTIVE PASS SCREEN ───────────────────────────────────────────────
  return (
    <div className="phone-shell screen-enter">
      <div className="status-bar">
        <span>{time}</span>
        <span>APSRTC APCityPrayaanam • 4G</span>
      </div>

      <div style={{ background: 'var(--blue)', padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 10 }}>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white' }}>
            My ePass
          </div>
          <span style={{
            background: existingPass ? '#4CAF50' : '#F5A623',
            color: existingPass ? 'white' : 'var(--blue)',
            fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
          }}>
            {existingPass ? 'ACTIVE' : 'NO ACTIVE PASS'}
          </span>
        </div>
      </div>

      <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>

        {existingPass ? (
          /* Active pass card */
          <div style={{
            margin: 14, background: 'linear-gradient(135deg, var(--blue) 0%, #1A4A9A 100%)',
            borderRadius: 16, padding: 20, color: 'white',
            boxShadow: '0 8px 24px rgba(27,58,107,0.3)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, opacity: 0.7 }}>AP TRANSIT</div>
              <div style={{ background: 'var(--gold)', color: 'var(--blue)', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                MONTHLY PASS
              </div>
            </div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, marginBottom: 2 }}>
              {existingPass.holder_name}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 14 }}>Pass ID: {existingPass.pass_id}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                ['Route', existingPass.route],
                ['Valid Until', existingPass.valid_until],
                ['Pass Type', 'Monthly — Ordinary'],
                ['Auto-renewal', '✓ UPI Active'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>Aadhaar Verified ✓</div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>Next renewal: auto via UPI</div>
              </div>
              <div style={{ background: 'white', borderRadius: 8, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QRCode value={existingPass.pass_id} size={64} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🪪</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No Active ePass</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 16 }}>
              Register for a monthly bus pass to travel without buying tickets every day.
            </div>
          </div>
        )}

        {/* Register new pass section */}
        <div style={{ padding: '0 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {existingPass ? 'Manage Pass' : 'Register New ePass'}
        </div>

        <div style={{ margin: '0 14px 14px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <button className="btn-teal" onClick={() => setScreen('apply')}>
            + APPLY FOR NEW ePASS
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', marginTop: 10 }}>
            No counter visit needed · Aadhaar OTP verification · UPI payment
          </div>
        </div>

        {/* Benefits */}
        <div style={{ margin: '0 14px 20px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Pass Benefits
          </div>
          {[
            ['💰', 'Save up to 40% vs daily tickets', 'Monthly pass at ₹350 vs ₹600+ daily fare'],
            ['🔄', 'Auto-renewal via UPI', 'Never miss renewal — auto-deduct 3 days before expiry'],
            ['📱', 'Digital QR — no physical card', 'Show QR on phone to conductor for instant validation'],
            ['🪪', 'Aadhaar-linked identity', 'Lost phone? Re-generate QR instantly after Aadhaar verify'],
          ].map(([icon, title, sub]) => (
            <div key={title as string} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {[['🏠','Home','/'],['🚌','Buses','/buses'],['🪪','ePass','/epass'],['⏰','Timetable','/timetable'],['👤','Profile','/profile']].map(([icon, label, path], i) => (
          <button key={i} className={`nav-item${path === '/epass' ? ' active' : ''}`} onClick={() => nav(path as string)}>
            <div className="nav-icon">{icon}</div>
            {path === '/epass' && <div className="nav-dot" />}
            <div className="nav-label" style={path === '/epass' ? { color: 'var(--blue)' } : {}}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
