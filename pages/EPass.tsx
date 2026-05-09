import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────
interface EPass {
  id: string
  pass_id: string
  holder_name: string
  pass_type: string
  route: string
  status: string
  valid_from: string
  valid_until: string
  auto_renewal: boolean
  amount: number
}

type FormStep = 'view' | 'form' | 'otp' | 'qr'

const PASS_AMOUNTS: Record<string, number> = {
  daily: 30, monthly: 350, student: 150, senior: 175,
}

const PASS_LABELS: Record<string, string> = {
  daily: 'Daily Pass', monthly: 'Monthly Pass',
  student: 'Student Pass', senior: 'Senior Citizen Pass',
}

// ── Simple QR SVG generator (no external library needed) ─────────────────────
function SimpleQR({ data, size = 160 }: { data: string; size?: number }) {
  // Creates a visual QR-like pattern from the data string
  const hash = data.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
  const cells = 21
  const cellSize = size / cells
  const modules: boolean[][] = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      // Finder patterns (corners)
      if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) {
        const inOuter = r === 0 || r === 6 || c === 0 || c === 6 || (r >= cells-7 && (r === cells-7 || r === cells-1 || c === 0 || c === 6)) || (c >= cells-7 && (c === cells-7 || c === cells-1 || r === 0 || r === 6))
        const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) || (r >= 2 && r <= 4 && c >= cells-5 && c <= cells-3) || (r >= cells-5 && r <= cells-3 && c >= 2 && c <= 4)
        return inOuter || inInner
      }
      // Data modules — pseudo-random from hash
      const seed = (r * cells + c + Math.abs(hash)) % 17
      return seed % 3 !== 0
    })
  )

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <rect width={size} height={size} fill="white" />
      {modules.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#1B3A6B"
            />
          ) : null
        )
      )}
    </svg>
  )
}

// ── Generate pass ID ──────────────────────────────────────────────────────────
function genPassId(passType: string, route: string): string {
  const city = route.toLowerCase().includes('visakhapatnam') || route.toLowerCase().includes('vizag') ? 'VSP'
    : route.toLowerCase().includes('vijayawada') ? 'VJA'
    : route.toLowerCase().includes('guntur') ? 'GNT'
    : 'VSP'
  const year = new Date().getFullYear()
  const num  = Math.floor(1000000 + Math.random() * 9000000)
  return `APTC-${year}-${city}-${num}`
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EPass() {
  const { t } = useLang()
  const nav = useNavigate()

  const [step, setStep]         = useState<FormStep>('view')
  const [activePass, setActivePass] = useState<EPass | null>(null)
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [newPassId, setNewPassId]   = useState('')
  const [otpValue, setOtpValue]     = useState('')
  const [otpError, setOtpError]     = useState('')
  const [otpSent, setOtpSent]       = useState(false)

  // Form state
  const [form, setForm] = useState({
    holder_name: '',
    aadhaar: '',
    mobile: '',
    pass_type: 'monthly',
    route: 'Visakhapatnam — All Routes',
    cfms_id: '',
    org_name: '',
    payment_method: 'UPI Autopay',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load existing active pass
  useEffect(() => {
    const storedId = localStorage.getItem('apcity-pass-id')
    if (storedId) {
      supabase.from('epasses').select('*').eq('pass_id', storedId).single()
        .then(({ data }) => {
          if (data) setActivePass(data)
          setLoading(false)
        })
    } else {
      // Try to load the demo pass (BVASSR KRISHNA)
      supabase.from('epasses').select('*')
        .eq('status', 'active').limit(1).single()
        .then(({ data }) => {
          if (data) setActivePass(data)
          setLoading(false)
        })
    }
  }, [])

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.holder_name.trim()) e.holder_name = 'Full name is required'
    if (!/^\d{12}$/.test(form.aadhaar.replace(/\s/g, '')))
      e.aadhaar = 'Enter valid 12-digit Aadhaar number'
    if (!/^\d{10}$/.test(form.mobile))
      e.mobile = 'Enter valid 10-digit mobile number'
    if (!form.route.trim()) e.route = 'Route is required'
    if ((form.pass_type === 'monthly' || form.pass_type === 'student') && !form.cfms_id.trim())
      e.cfms_id = 'CFMS / Student ID is required for this pass type'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSendOtp() {
    if (!validate()) return
    setOtpSent(true)
    // Simulate OTP sent
    setTimeout(() => {}, 1000)
  }

  async function handleVerifyAndRegister() {
    if (otpValue.length !== 6) {
      setOtpError('Enter the 6-digit OTP sent to your mobile')
      return
    }
    // Accept any 6-digit OTP for prototype
    setOtpError('')
    setSubmitting(true)

    try {
      const passId    = genPassId(form.pass_type, form.route)
      const isInstant = form.pass_type === 'daily' || form.pass_type === 'senior'
      const status    = isInstant ? 'active' : 'pending'
      const amount    = PASS_AMOUNTS[form.pass_type] || 350

      const today   = new Date()
      const until   = new Date()
      until.setDate(today.getDate() + (form.pass_type === 'daily' ? 1 : 30))

      const { error } = await supabase.from('epasses').insert({
        pass_id:        passId,
        holder_name:    form.holder_name.trim().toUpperCase(),
        aadhaar_last4:  form.aadhaar.slice(-4),
        mobile:         form.mobile,
        pass_type:      form.pass_type,
        route:          form.route,
        cfms_id:        form.cfms_id || null,
        org_name:       form.org_name || null,
        payment_method: form.payment_method,
        amount,
        status,
        valid_from:     today.toISOString().split('T')[0],
        valid_until:    until.toISOString().split('T')[0],
        auto_renewal:   form.payment_method === 'UPI Autopay',
      })

      if (error) {
        console.error(error)
        setOtpError('Registration failed. Try again.')
        setSubmitting(false)
        return
      }

      localStorage.setItem('apcity-pass-id', passId)
      setNewPassId(passId)
      setStep('qr')
    } catch (e) {
      console.error(e)
      setOtpError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const needsVerification = form.pass_type === 'monthly' || form.pass_type === 'student'

  // ── RENDER: Loading ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="phone-shell">
      <div className="status-bar"><span>9:41 AM</span><span>APSRTC APCityPrayaanam</span></div>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--mute)' }}>Loading ePass...</div>
    </div>
  )

  // ── RENDER: QR Code page ────────────────────────────────────────────────────
  if (step === 'qr') {
    const isInstant = form.pass_type === 'daily' || form.pass_type === 'senior'
    const qrData = JSON.stringify({
      passId: newPassId, holder: form.holder_name.toUpperCase(),
      type: form.pass_type, route: form.route,
      issued: new Date().toISOString(), issuer: 'APSRTC-APCityPrayaanam',
    })
    return (
      <div className="phone-shell">
        <div className="status-bar"><span>9:41 AM</span><span>APSRTC APCityPrayaanam</span></div>
        <div style={{ background: 'var(--blue)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setStep('view')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer' }}>←</button>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'white' }}>Your ePass</div>
          <div style={{ marginLeft: 'auto', background: isInstant ? '#E8F5E9' : '#FFF3E0', color: isInstant ? '#1A7A4A' : '#9A6700', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            {isInstant ? 'ACTIVE' : 'PENDING'}
          </div>
        </div>

        <div className="scrollable">
          {/* Pass card */}
          <div style={{
            margin: 14, borderRadius: 16, overflow: 'hidden',
            background: 'linear-gradient(135deg, #1B3A6B 0%, #1A4A9A 100%)',
            boxShadow: '0 8px 24px rgba(27,58,107,0.3)', position: 'relative',
          }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', bottom: -40, left: -20, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

            <div style={{ padding: 20, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>
                  AP TRANSIT
                </div>
                <div style={{ background: 'var(--gold)', color: 'var(--blue)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                  {PASS_LABELS[form.pass_type]?.toUpperCase() || 'PASS'}
                </div>
              </div>

              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 24, fontWeight: 700, color: 'white', marginTop: 14 }}>
                {form.holder_name.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{newPassId}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Route</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{form.route}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Valid Until</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>
                    {new Date(Date.now() + (form.pass_type === 'daily' ? 1 : 30) * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Pass Type</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{PASS_LABELS[form.pass_type]}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Auto-Renewal</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>
                    {form.payment_method === 'UPI Autopay' ? '✓ UPI Active' : 'Manual'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Aadhaar Verified ✓</div>
                <div style={{ background: 'white', borderRadius: 8, padding: 6, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 28 }}>📱</div>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code */}
          <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
              BUS PASS — Show to conductor
            </div>
            <div style={{ display: 'inline-block', border: '3px solid var(--blue)', borderRadius: 12, padding: 12, background: 'white' }}>
              <SimpleQR data={qrData} size={180} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 12, lineHeight: 1.5 }}>
              Scan QR code to verify this bus pass.{'\n'}
              Valid only on authorised APSRTC city buses.
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--mute)', letterSpacing: 1 }}>
              {newPassId}
            </div>
          </div>

          {/* Status notice */}
          {!isInstant && (
            <div style={{ margin: '0 14px 14px', background: '#FFF8E1', borderRadius: 12, padding: 14, borderLeft: '4px solid #F5A623' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#854F0B', marginBottom: 6 }}>
                ⏳ 24-Hour Online Verification
              </div>
              <div style={{ fontSize: 12, color: '#9A6700', lineHeight: 1.6 }}>
                Your {PASS_LABELS[form.pass_type]} requires online verification of your CFMS / Student ID and organisation details. Your pass will be activated within <b>24 hours</b>. An SMS confirmation will be sent to {form.mobile}.
              </div>
            </div>
          )}

          {isInstant && (
            <div style={{ margin: '0 14px 14px', background: '#E8F5E9', borderRadius: 12, padding: 14, borderLeft: '4px solid #1A7A4A' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A7A4A', marginBottom: 4 }}>
                ✅ Pass Activated Instantly
              </div>
              <div style={{ fontSize: 12, color: '#2D6A4F', lineHeight: 1.6 }}>
                Your {PASS_LABELS[form.pass_type]} is now active. Show this QR code to the conductor when boarding.
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ padding: '0 14px 14px', display: 'flex', gap: 10 }}>
            <button className="btn-teal" style={{ flex: 1 }}
              onClick={() => { setStep('view'); setActivePass(null) }}>
              ✓ Done
            </button>
          </div>

          <div style={{ height: 20 }} />
        </div>
      </div>
    )
  }

  // ── RENDER: OTP Step ────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div className="phone-shell">
        <div className="status-bar"><span>9:41 AM</span><span>APSRTC APCityPrayaanam</span></div>
        <div style={{ background: 'var(--blue)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setStep('form')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer' }}>←</button>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'white' }}>Verify Aadhaar</div>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>OTP Sent</div>
              <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.5 }}>
                A 6-digit OTP has been sent to<br />
                <b style={{ color: 'var(--text)' }}>+91 {form.mobile}</b> via Aadhaar
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Enter 6-digit OTP</label>
              <input
                className="form-input"
                type="number"
                placeholder="000000"
                value={otpValue}
                onChange={e => { setOtpValue(e.target.value.slice(0, 6)); setOtpError('') }}
                style={{ fontSize: 24, fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, letterSpacing: 8, textAlign: 'center' }}
              />
              {otpError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{otpError}</div>}
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 6, textAlign: 'center' }}>
                For prototype: enter any 6 digits
              </div>
            </div>

            <button className="btn-primary" onClick={handleVerifyAndRegister} disabled={submitting}>
              {submitting ? 'Registering...' : '✓ VERIFY & REGISTER'}
            </button>

            <button onClick={() => {}} style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontSize: 13, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}>
              Resend OTP
            </button>
          </div>

          {/* Pass summary */}
          <div style={{ background: 'white', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)', marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>Pass Summary</div>
            {[
              { l: 'Name',      v: form.holder_name.toUpperCase() },
              { l: 'Pass Type', v: PASS_LABELS[form.pass_type] },
              { l: 'Route',     v: form.route },
              { l: 'Amount',    v: `₹ ${PASS_AMOUNTS[form.pass_type]}` },
              { l: 'Payment',   v: form.payment_method },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 4 ? '1px solid #F0F4FA' : 'none' }}>
                <div style={{ fontSize: 12, color: 'var(--mute)' }}>{r.l}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Registration Form ────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="phone-shell">
        <div className="status-bar"><span>9:41 AM</span><span>APSRTC APCityPrayaanam</span></div>
        <div style={{ background: 'var(--blue)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setStep('view')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer' }}>←</button>
          <div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'white' }}>{t('selfReg')}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t('noCounter')}</div>
          </div>
        </div>

        <div className="scrollable">
          <div style={{ background: 'white', margin: 14, borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>

            {/* Full Name */}
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">{t('fullName')}</label>
              <input className="form-input" type="text"
                placeholder={t('asPerAadhaar')} value={form.holder_name}
                onChange={e => update('holder_name', e.target.value)} />
              {errors.holder_name && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors.holder_name}</div>}
            </div>

            {/* Aadhaar + Mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label className="form-label">{t('aadhaar')}</label>
                <input className="form-input" type="number"
                  placeholder="0000 0000 0000" value={form.aadhaar}
                  onChange={e => update('aadhaar', e.target.value)} />
                {errors.aadhaar && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{errors.aadhaar}</div>}
              </div>
              <div>
                <label className="form-label">{t('mobile')}</label>
                <input className="form-input" type="tel"
                  placeholder="9XXXXXXXXX" value={form.mobile}
                  onChange={e => update('mobile', e.target.value)} />
                {errors.mobile && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{errors.mobile}</div>}
              </div>
            </div>

            {/* Pass Type */}
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">{t('passType')}</label>
              <select className="form-input" value={form.pass_type}
                onChange={e => update('pass_type', e.target.value)}>
                <option value="monthly">{t('monthly')}</option>
                <option value="daily">{t('daily')}</option>
                <option value="student">{t('student')}</option>
                <option value="senior">{t('senior')}</option>
              </select>
            </div>

            {/* Route */}
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">{t('route')}</label>
              <select className="form-input" value={form.route}
                onChange={e => update('route', e.target.value)}>
                <option>Visakhapatnam — All Routes</option>
                <option>RTC Complex — Rushikonda (900R)</option>
                <option>RTC Complex — Gajuwaka (400)</option>
                <option>RTC Complex — Maddilapalem (10K)</option>
                <option>Simhachalam — MVP Colony (60R)</option>
                <option>RTC Complex — Airport (22C)</option>
                <option>Vijayawada — All Routes</option>
                <option>Guntur — All Routes</option>
                <option>Specific Route Only</option>
              </select>
              {errors.route && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors.route}</div>}
            </div>

            {/* CFMS / Student ID */}
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">{t('cfmsId')}</label>
              <input className="form-input" type="text"
                placeholder={form.pass_type === 'student' ? 'e.g. STU-AU-2024-12345' : 'e.g. CFMS-AP-1234567'}
                value={form.cfms_id}
                onChange={e => update('cfms_id', e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4, lineHeight: 1.4 }}>
                {form.pass_type === 'student'
                  ? 'Student ID issued by your college or school'
                  : 'Comprehensive Financial Management System ID for AP govt employees'}
              </div>
              {errors.cfms_id && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors.cfms_id}</div>}
            </div>

            {/* Organisation Name */}
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">{t('orgName')}</label>
              <input className="form-input" type="text"
                placeholder={form.pass_type === 'student' ? 'e.g. Andhra University' : 'e.g. APSRTC Visakhapatnam Region'}
                value={form.org_name}
                onChange={e => update('org_name', e.target.value)} />
            </div>

            {/* Payment Method */}
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">{t('payment')}</label>
              <select className="form-input" value={form.payment_method}
                onChange={e => update('payment_method', e.target.value)}>
                <option value="UPI Autopay">{t('upiAutopay')}</option>
                <option value="UPI One-time">{t('upiOnetime')}</option>
                <option value="Net Banking">{t('netBanking')}</option>
              </select>
            </div>

            {/* 24-hour verification notice */}
            {needsVerification && (
              <div style={{ background: '#FFF8E1', borderRadius: 10, padding: 12, borderLeft: '4px solid #F5A623', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#854F0B', marginBottom: 4 }}>
                  ⏰ {t('verifyNote')}
                </div>
                <div style={{ fontSize: 11, color: '#9A6700', lineHeight: 1.5 }}>
                  {t('verifyDetail')}
                </div>
              </div>
            )}

            {/* Submit */}
            <button className="btn-primary" onClick={handleSendOtp}
              style={{ background: needsVerification ? 'var(--teal)' : 'var(--blue)' }}>
              {needsVerification ? t('submitVerify') : t('verifyAadhaar')}
            </button>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', marginTop: 10, lineHeight: 1.5 }}>
              {t('instantNote')}
            </div>
          </div>
          <div style={{ height: 20 }} />
        </div>
      </div>
    )
  }

  // ── RENDER: View Pass (default) ──────────────────────────────────────────────
  return (
    <div className="phone-shell">
      <div className="status-bar">
        <span>9:41 AM</span>
        <span>APSRTC APCityPrayaanam • 4G</span>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--blue)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => nav('/')} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer' }}>←</button>
        <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: 'white', flex: 1 }}>{t('myEPassTitle')}</div>
        {activePass && (
          <div style={{ background: activePass.status === 'active' ? '#E8F5E9' : '#FFF3E0', color: activePass.status === 'active' ? '#1A7A4A' : '#9A6700', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            {activePass.status.toUpperCase()}
          </div>
        )}
      </div>

      <div className="scrollable">

        {/* Active pass card */}
        {activePass ? (
          <div style={{
            margin: 14, borderRadius: 16,
            background: 'linear-gradient(135deg, #1B3A6B 0%, #1A4A9A 100%)',
            boxShadow: '0 8px 24px rgba(27,58,107,0.3)',
            padding: 20, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', bottom: -40, left: -20, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>AP TRANSIT</div>
                <div style={{ background: 'var(--gold)', color: 'var(--blue)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                  {PASS_LABELS[activePass.pass_type]?.toUpperCase() || 'PASS'}
                </div>
              </div>

              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: 'white', marginTop: 14 }}>
                {activePass.holder_name}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{activePass.pass_id}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Route</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{activePass.route}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Valid Until</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>
                    {new Date(activePass.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Pass Type</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{PASS_LABELS[activePass.pass_type]}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Auto-Renewal</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{activePass.auto_renewal ? '✓ UPI Active' : 'Manual'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Aadhaar Verified ✓</div>
                {/* Mini QR */}
                <div style={{ background: 'white', borderRadius: 8, padding: 6, display: 'inline-block' }}>
                  <SimpleQR data={activePass.pass_id} size={52} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🪪</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No Active ePass</div>
            <div style={{ fontSize: 13, color: 'var(--mute)' }}>Register below for a digital bus pass</div>
          </div>
        )}

        {/* Register new pass section */}
        <div style={{ padding: '0 14px 8px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Register New ePass
        </div>

        <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('selfReg')}</div>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 16 }}>{t('noCounter')} Instant Approval for Daily & Senior passes.</div>

          {/* Pass type quick select */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {(['monthly','daily','student','senior'] as const).map(pt => (
              <button key={pt} style={{
                padding: '10px 8px', borderRadius: 10,
                border: `1.5px solid var(--blue)`,
                background: 'var(--light)', color: 'var(--blue)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
              }} onClick={() => { setForm(f => ({ ...f, pass_type: pt })); setStep('form') }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>
                  {pt === 'monthly' ? '📅' : pt === 'daily' ? '🗓️' : pt === 'student' ? '🎓' : '👴'}
                </div>
                <div>{PASS_LABELS[pt]}</div>
                <div style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>₹ {PASS_AMOUNTS[pt]}</div>
              </button>
            ))}
          </div>

          <button className="btn-primary" onClick={() => setStep('form')}>
            + Register New Pass
          </button>
        </div>

        {/* Benefits */}
        <div style={{ background: 'white', margin: '0 14px 14px', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>ePass Benefits</div>
          {[
            { icon: '✓', text: 'No counter visit — register from home' },
            { icon: '✓', text: 'Instant QR code on your phone' },
            { icon: '✓', text: 'Auto-renewal via UPI mandate' },
            { icon: '✓', text: 'Aadhaar-verified — no document carry' },
            { icon: '✓', text: 'Valid on all APSRTC city buses' },
          ].map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>{b.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{b.text}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 20 }} />
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {[
          { icon: '🏠', label: t('home'), path: '/' },
          { icon: '🚌', label: t('buses'), path: '/buses' },
          { icon: '🪪', label: t('epass'), path: '/epass' },
          { icon: '⏰', label: t('timetable'), path: '/timetable' },
          { icon: '👤', label: t('profile'), path: '/profile' },
        ].map((item, i) => (
          <button key={i}
            className={`nav-item${window.location.pathname === item.path ? ' active' : ''}`}
            onClick={() => nav(item.path)}>
            <div className="nav-icon">{item.icon}</div>
            {window.location.pathname === item.path && <div className="nav-dot" />}
            <div className="nav-label" style={window.location.pathname === item.path ? { color: 'var(--blue)' } : {}}>
              {item.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
