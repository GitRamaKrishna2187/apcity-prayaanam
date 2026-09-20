import { useState, useEffect, useRef } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import QRLib from 'qrcode'

// ── QR code ──────────────────────────────────────────────────────────────────
// This was previously a decorative pattern derived from a string hash — it
// looked like a QR code and no scanner on earth could read it. It now encodes
// a real payload: "<pass_id>|<rotating 6-digit code>".
function QRCode({ value, size = 120 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    QRLib.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then(out => { if (alive) setSvg(out) })
      .catch(() => { if (alive) setSvg('') })
    return () => { alive = false }
  }, [value])

  if (!svg) return <div style={{ width: size, height: size, background: '#EDF1F8', borderRadius: 4 }} />
  return (
    <div
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{
        __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`),
      }}
    />
  )
}

// ── Rotating code (TOTP) ─────────────────────────────────────────────────────
// Mirrors totp_code() in the database exactly: HMAC-SHA256 over the 30-second
// step, first 8 bytes big-endian, AND 0x7FFFFFFF, mod 1e6. A screenshot of the
// card is worthless roughly half a minute after it is taken.
function useRotatingCode(secret: string | null | undefined) {
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState(30)
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    if (!secret) { setCode(''); return }
    if (!globalThis.crypto?.subtle) { setUnsupported(true); return }
    let alive = true
    let key: CryptoKey | null = null

    async function tick() {
      try {
        if (!key) {
          key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret!),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        }
        const nowSec = Math.floor(Date.now() / 1000)
        const step = BigInt(Math.floor(nowSec / 30))
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(step.toString()))
        const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
        const v = (BigInt('0x' + hex.slice(0, 16)) & 0x7FFFFFFFn) % 1000000n
        if (!alive) return
        setCode(v.toString().padStart(6, '0'))
        setRemaining(30 - (nowSec % 30))
      } catch { if (alive) setUnsupported(true) }
    }

    tick()
    const i = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(i) }
  }, [secret])

  return { code, remaining, unsupported }
}

// ── Pass ID generator ─
// ── Pass ID generator ──────────────────────────────────────────────────────────
// The previous generator drew from 40000..49999 — about ten thousand values per
// year, enumerable in minutes with the public anon key. This draws 40 bits from
// the CSPRNG and renders them in Crockford base32 (no I, L, O or U, so it can be
// read aloud and typed without ambiguity).
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function genPassId() {
  const yy = String(new Date().getFullYear()).slice(-2)
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  for (let i = 0; i < 8; i++) { out = B32[Number(n & 31n)] + out; n >>= 5n }
  return `APTC-${yy}-VSP-${out}`
}

// ── Holder credentials (pass_id + access_token) ──────────────────────────────
// Anon can no longer SELECT from epasses. The holder reads their own pass with
// get_my_epass(pass_id, token); the token lives only in this browser.
const CRED_KEY = 'apcp.epass.cred'
type Cred = { passId: string; token: string }

function loadCred(): Cred | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    return raw ? JSON.parse(raw) as Cred : null
  } catch { return null }
}
function saveCred(c: Cred) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

async function fetchMyPass(cred: Cred | null) {
  if (!cred) return null
  const { data, error } = await supabase.rpc('get_my_epass', {
    p_pass_id: cred.passId, p_token: cred.token,
  })
  if (error || !data || !data.length) return null
  return data[0]
}

// ── Image handling ────────────────────────────────────────────────────────────
// Applicants upload from a phone on mobile data. A raw 4 MB camera JPEG will
// either time out or blow the bucket's file_size_limit, so everything is
// downscaled and re-encoded in the browser before it ever hits the network.
function compressImage(file: File, maxDim: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') { resolve(file); return }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const scale = Math.min(1, maxDim / Math.max(width, height))
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas unavailable')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('encode failed')), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not a readable image')) }
    img.src = url
  })
}

async function uploadTo(bucket: string, path: string, file: File, maxDim: number, quality: number) {
  const blob = await compressImage(file, maxDim, quality)
  const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg'
  const fullPath = `${path}.${ext}`
  // upsert is deliberately OFF. Every application gets a fresh pass_id, so these
  // paths never legitimately collide. Enabling upsert makes storage-api issue
  // INSERT … ON CONFLICT DO UPDATE, which would require granting anon an UPDATE
  // policy on storage.objects — and that would let anyone overwrite another
  // applicant's photo or Aadhaar image by guessing a path. A collision here is a
  // bug worth surfacing, not something to silently overwrite.
  const { error } = await supabase.storage.from(bucket).upload(fullPath, blob, {
    contentType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  if (bucket === 'epass-photos') {
    return supabase.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl
  }
  // Private bucket — store the object path, not a URL. The depot portal signs it.
  return fullPath
}

// Supabase returns the same terse "new row violates row-level security policy"
// whether a storage upload or a table insert was blocked. Without knowing which
// step failed the message is undiagnosable, so every await is tagged with a stage
// and the error is translated into something that names the actual misconfiguration.
function describeFailure(stage: string, e: any): string {
  const msg = String(e?.message || e || 'unknown error')
  const rls = /row-level security/i.test(msg)
  if (rls && stage.startsWith('storage:')) {
    const bucket = stage.split(':')[1]
    return `upload to the "${bucket}" bucket was refused by storage security rules. ` +
           `The bucket exists, but it has no INSERT policy for the anon role.`
  }
  if (/already exists|duplicate/i.test(msg) && stage.startsWith('storage:')) {
    return 'a file already exists at this path. Retry — a new application reference will be generated.'
  }
  if (rls) return 'the application row was refused by security rules on the epasses table.'
  if (/bucket not found/i.test(msg)) {
    return `storage bucket "${stage.split(':')[1] || '?'}" does not exist — bucket creation in the migration did not run.`
  }
  if (/schema cache|PGRST204/i.test(msg) || /column .* does not exist/i.test(msg)) {
    return `the database is missing a column this form writes (${msg}) — run epass_v2_migration.sql, then reload the PostgREST schema cache.`
  }
  return `${msg} [stage: ${stage}]`
}

// ── Zones (replaces route selection) ──────────────────────────────────────────
const ZONES = [
  'Zone A — North (Madhurawada · Rushikonda · Bheemili)',
  'Zone B — Central (RTC Complex · Dwaraka Nagar · Siripuram)',
  'Zone C — South (Gajuwaka · Kurmannapalem · Steel Plant)',
  'Zone D — West (Pendurthi · Sabbavaram · Anandapuram)',
  'All Zones — Visakhapatnam City',
]

const AMOUNTS: Record<string, number> = { monthly: 350, student: 150, senior: 175, daily: 50 }

function ageFromDob(dob: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a
}

const PASS_LABEL: Record<string, { en: string; te: string }> = {
  monthly: { en: 'MONTHLY', te: 'నెలవారీ' },
  daily:   { en: 'DAILY',   te: 'రోజువారీ' },
  student: { en: 'STUDENT', te: 'విద్యార్థి' },
  senior:  { en: 'SENIOR CITIZEN', te: 'వయోవృద్ధుల' },
}

function fmtDate(d: string) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ══════════════════════════════════════════════════════════════════════════════
// ID CARD — rendered as an actual identity card, not a screen section.
// Front: photo, name, organisation/institution, pass type, valid until.
// Back:  zone, DOB, conditions of use, helpline. Tap to flip.
// ══════════════════════════════════════════════════════════════════════════════
function PassIdCard({ pass }: { pass: any }) {
  const [flipped, setFlipped] = useState(false)
  const { code, remaining, unsupported } = useRotatingCode(pass.qr_secret)
  const type = PASS_LABEL[pass.pass_type] || PASS_LABEL.monthly
  const expired = pass.valid_until && new Date(pass.valid_until) < new Date()

  const shell: CSSProperties = {
    position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
    borderRadius: 14, overflow: 'hidden', background: 'white',
    border: '1px solid #C9D6EC', boxShadow: '0 10px 28px rgba(13,43,94,0.22)',
    display: 'flex', flexDirection: 'column',
  }

  return (
    <div style={{ margin: 14 }}>
      <div
        onClick={() => setFlipped(f => !f)}
        style={{ perspective: 1200, cursor: 'pointer', height: 322 }}
        title="Tap to flip"
      >
        <div style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d', transition: 'transform 0.55s cubic-bezier(.4,.2,.2,1)',
          transform: flipped ? 'rotateY(180deg)' : 'none',
        }}>

          {/* ── FRONT ─────────────────────────────────────────────────── */}
          <div style={shell}>
            {/* Issuing authority band */}
            <div style={{
              background: 'linear-gradient(135deg, var(--blue) 0%, #12305C 100%)',
              padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9,
              borderBottom: '3px solid var(--gold)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, flexShrink: 0,
              }}>🚌</div>
              <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: 0.6 }}>
                  APSRTC · VISAKHAPATNAM CITY
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.72)' }}>
                  ఆంధ్రప్రదేశ్ రాష్ట్ర రోడ్డు రవాణా సంస్థ
                </div>
              </div>
              <div style={{
                background: 'var(--gold)', color: 'var(--blue)', fontSize: 9, fontWeight: 800,
                padding: '3px 8px', borderRadius: 4, textAlign: 'center', lineHeight: 1.3, flexShrink: 0,
              }}>
                <div>{type.en}</div>
                <div style={{ fontSize: 8, fontWeight: 600 }}>{type.te}</div>
              </div>
            </div>

            {/* Card body */}
            <div style={{ display: 'flex', gap: 12, padding: '12px 12px 8px', flex: 1 }}>
              {/* Photo block */}
              <div style={{ flexShrink: 0 }}>
                <div style={{
                  width: 86, height: 104, borderRadius: 6, overflow: 'hidden',
                  border: '2px solid var(--blue)', background: '#EDF1F8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pass.photo_url
                    ? <img src={pass.photo_url} alt="Pass holder"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 30, opacity: 0.35 }}>👤</span>}
                </div>
                <div style={{
                  fontSize: 7.5, color: 'var(--mute)', textAlign: 'center',
                  marginTop: 3, letterSpacing: 0.3,
                }}>PHOTO · ఫోటో</div>
              </div>

              {/* Details block */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Field labelEn="NAME" labelTe="పేరు" value={pass.holder_name} big />
                <Field labelEn="ORGANISATION / INSTITUTION" labelTe="సంస్థ"
                       value={pass.institution || pass.org_name || '—'} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field labelEn="PASS TYPE" labelTe="పాస్ రకం" value={type.en} />
                  <Field labelEn="VALID UNTIL" labelTe="చెల్లుబాటు"
                         value={fmtDate(pass.valid_until)} danger={!!expired} />
                </div>
              </div>
            </div>

            {/* Rotating QR + pass number strip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 10px',
            }}>
              <div style={{
                background: 'white', border: `1px solid ${code ? '#D8E1F0' : '#F0C0C0'}`,
                borderRadius: 5, padding: 3, flexShrink: 0, position: 'relative',
              }}>
                <QRCode value={`${pass.pass_id}|${code || '000000'}`} size={54} />
                {/* Expiry ring — the passenger can see the code is about to turn over */}
                <div style={{
                  position: 'absolute', left: 3, right: 3, bottom: -1, height: 2,
                  background: '#E2E8F0', borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(remaining / 30) * 100}%`, height: '100%',
                    background: remaining <= 5 ? 'var(--red)' : 'var(--green)',
                    transition: 'width 1s linear',
                  }} />
                </div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: 0.4 }}>PASS ID · పాస్ ఐడీ</div>
                <div style={{
                  fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700,
                  color: 'var(--text)', letterSpacing: 0.2, wordBreak: 'break-all',
                }}>{pass.pass_id}</div>
                <div style={{
                  fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: 2,
                  color: unsupported ? 'var(--red)' : 'var(--blue)', marginTop: 2,
                }}>
                  {unsupported ? 'CODE UNAVAILABLE' : (code || '••••••')}
                  {!unsupported && code && (
                    <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0, color: 'var(--mute)', marginLeft: 5 }}>
                      {remaining}s
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontFamily: 'Rajdhani,sans-serif', fontSize: 11, fontWeight: 700,
                  color: 'var(--blue)', borderBottom: '1px solid var(--mute)', paddingBottom: 1,
                }}>Depot Manager</div>
                <div style={{ fontSize: 7.5, color: 'var(--mute)', marginTop: 2 }}>Issuing Authority</div>
              </div>
            </div>

            {/* Footer band */}
            <div style={{
              background: 'var(--blue)', padding: '5px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)' }}>
                NON-TRANSFERABLE · బదిలీ చేయరాదు
              </span>
              <span style={{ fontSize: 8, color: 'var(--gold)', fontWeight: 700 }}>TAP TO FLIP ⟳</span>
            </div>
          </div>

          {/* ── BACK ──────────────────────────────────────────────────── */}
          <div style={{ ...shell, transform: 'rotateY(180deg)' }}>
            <div style={{ background: '#12305C', padding: '7px 12px', borderBottom: '3px solid var(--gold)' }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 12, fontWeight: 700, color: 'white', letterSpacing: 0.6 }}>
                CONDITIONS OF USE · వినియోగ నిబంధనలు
              </div>
            </div>

            <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Field labelEn="ZONE OF VALIDITY" labelTe="జోన్" value={pass.zone || pass.route || '—'} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Field labelEn="DATE OF BIRTH" labelTe="పుట్టిన తేదీ" value={fmtDate(pass.dob)} />
                <Field labelEn="ISSUED ON" labelTe="జారీ తేదీ" value={fmtDate(pass.valid_from)} />
              </div>

              <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 600 }}>
                ✓ Aadhaar verified · ends {pass.aadhaar_last4 || '****'}
              </div>

              <ol style={{ margin: '2px 0 0 14px', padding: 0, fontSize: 9, color: 'var(--text)', lineHeight: 1.65 }}>
                <li>Valid only for the holder named overleaf. Non-transferable.<br/>
                  <span style={{ color: 'var(--mute)' }}>పాస్ కేవలం పేర్కొన్న వ్యక్తికి మాత్రమే చెల్లుతుంది.</span></li>
                <li>Produce the QR code on demand to the conductor or checking staff.<br/>
                  <span style={{ color: 'var(--mute)' }}>కండక్టర్ అడిగినప్పుడు QR చూపవలెను.</span></li>
                <li>Misuse attracts penalty under APSRTC conduct rules and cancellation.<br/>
                  <span style={{ color: 'var(--mute)' }}>దుర్వినియోగం చేస్తే రద్దు మరియు జరిమానా.</span></li>
              </ol>

              <div style={{
                marginTop: 'auto', background: 'var(--light)', borderRadius: 6,
                padding: '6px 9px', fontSize: 9, color: 'var(--blue)',
              }}>
                <b>Helpline · హెల్ప్‌లైన్:</b> 0866-2570005 · apsrtc.ap.gov.in
              </div>
            </div>

            <div style={{ background: 'var(--blue)', padding: '5px 12px', textAlign: 'center' }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)' }}>
                If found, return to the nearest APSRTC depot
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function Field({ labelEn, labelTe, value, big, danger }: {
  labelEn: string; labelTe: string; value: string; big?: boolean; danger?: boolean
}) {
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 7.5, color: 'var(--mute)', letterSpacing: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {labelEn} · {labelTe}
      </div>
      <div style={{
        fontFamily: big ? 'Rajdhani,sans-serif' : 'inherit',
        fontSize: big ? 17 : 11,
        fontWeight: big ? 700 : 600,
        color: danger ? 'var(--red)' : 'var(--text)',
        lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: big ? 'nowrap' : 'normal',
      }}>{value || '—'}</div>
    </div>
  )
}

// ── Upload tile used by the registration form ────────────────────────────────
function UploadTile({ label, sublabel, file, preview, required, accept, capture, onPick }: {
  label: string; sublabel: string; file: File | null; preview: string | null
  required: boolean; accept: string; capture?: 'user' | 'environment'
  onPick: (f: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="form-label">{label} {required && <span style={{ color: 'var(--red)' }}>*</span>}</label>
      <div
        onClick={() => ref.current?.click()}
        style={{
          border: `1.5px dashed ${file ? 'var(--green)' : '#C9D6EC'}`,
          background: file ? '#F3FBF5' : '#FAFBFE',
          borderRadius: 8, padding: 10, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <div style={{
          width: 44, height: 52, borderRadius: 5, flexShrink: 0, overflow: 'hidden',
          background: '#E7EDF8', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {preview
            ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 19, opacity: 0.5 }}>{accept.includes('pdf') ? '📄' : '📷'}</span>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: file ? 'var(--green)' : 'var(--text)' }}>
            {file ? `✓ ${file.name.slice(0, 26)}` : 'Tap to upload'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{sublabel}</div>
        </div>
        {file && (
          <button
            onClick={e => { e.stopPropagation(); onPick(null); if (ref.current) ref.current.value = '' }}
            style={{ background: 'none', border: 'none', color: 'var(--mute)', fontSize: 16, cursor: 'pointer' }}
          >✕</button>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} capture={capture} style={{ display: 'none' }}
        onChange={e => onPick(e.target.files?.[0] || null)} />
    </div>
  )
}

type Screen = 'view' | 'apply' | 'submitted'

export default function EPass() {
  const nav = useNavigate()
  const { t } = useLang()
  const [screen, setScreen] = useState<Screen>('view')
  const [submittedPassId, setSubmittedPassId] = useState<string>('')
  const [existingPass, setExistingPass] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [passStatus, setPassStatus] = useState<'pending'|'active'|'rejected'>('pending')
  const [approvedAt, setApprovedAt] = useState<string>('')
  const [rejectionReason, setRejectionReason] = useState<string>('')

  const getIST = () => new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
  })
  const [time, setTime] = useState(getIST())
  useEffect(() => {
    const tk = setInterval(() => setTime(getIST()), 1000)
    return () => clearInterval(tk)
  }, [])

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    fullName: 'BVASSR KRISHNA',
    aadhaar: '',
    mobile: '9848032919',
    dob: '',
    passType: 'monthly',
    zone: ZONES[4],
    cfmsId: '14815316',
    institution: 'AP State Government — Visakhapatnam',
    payment: 'upi_autopay',
  })
  const [photoFile, setPhotoFile]   = useState<File | null>(null)
  const [photoPrev, setPhotoPrev]   = useState<string | null>(null)
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null)
  const [aadhaarPrev, setAadhaarPrev] = useState<string | null>(null)
  const [idFile, setIdFile]         = useState<File | null>(null)
  const [idPrev, setIdPrev]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadMsg, setUploadMsg]   = useState('')
  const [formError, setFormError]   = useState('')

  // Revokes the previous object URL before creating a new one, so repeatedly
  // re-picking a file does not leak blob handles on a low-end phone.
  const pickWithPreview = (
    setFile: Dispatch<SetStateAction<File | null>>,
    setPrev: Dispatch<SetStateAction<string | null>>
  ) => (f: File | null) => {
    setFile(f)
    setPrev(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return f && f.type !== 'application/pdf' ? URL.createObjectURL(f) : null
    })
  }

  const age = ageFromDob(form.dob)
  const idDocRequired = form.passType === 'student' || form.passType === 'senior'

  // ── Existing pass lookup ────────────────────────────────────────────────────
  useEffect(() => {
    async function checkPass() {
      // Previously this selected the most recent active pass in the whole table,
      // which only worked because anon could read every row. It now reads the
      // one pass this browser holds a token for.
      const pass = await fetchMyPass(loadCred())
      setExistingPass(pass && pass.status === 'active' ? pass : null)
      setLoading(false)
    }
    if (screen === 'view') checkPass()
  }, [screen])

  // ── Status polling on the submitted screen ─────────────────────────────────
  // The Realtime subscription is gone: with RLS locked down, anon no longer has
  // SELECT on epasses, so postgres_changes would deliver nothing. A 5-second
  // poll of get_my_epass() is the honest equivalent.
  useEffect(() => {
    if (screen !== 'submitted' || !submittedPassId) return
    let alive = true

    async function fetchStatus() {
      const pass = await fetchMyPass(loadCred())
      if (!alive || !pass) return
      setPassStatus(pass.status as 'pending' | 'active' | 'rejected')
      if (pass.rejection_reason) setRejectionReason(pass.rejection_reason)
      if (pass.status === 'active' || pass.status === 'rejected') {
        setApprovedAt(new Date(pass.updated_at).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
        }))
        if (pass.status === 'active') setExistingPass(pass)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => { alive = false; clearInterval(interval) }
  }, [screen, submittedPassId])

  // ── Validation + submit ─────────────────────────────────────────────────────
  function validate(): string {
    if (!form.fullName.trim()) return 'Enter the full name as printed on Aadhaar.'
    if (!/^\d{12}$/.test(form.aadhaar)) return 'Aadhaar number must be exactly 12 digits.'
    if (!/^\d{10}$/.test(form.mobile)) return 'Mobile number must be exactly 10 digits.'
    if (!form.dob) return 'Date of birth is required.'
    if (age === null || age < 5 || age > 110) return 'Enter a valid date of birth.'
    if (!form.institution.trim()) return 'Organisation / institution name is required.'
    if (!photoFile) return 'A recent passport-style photo is required for the pass.'
    if (!aadhaarFile) return 'An Aadhaar card image or PDF is required.'
    const tooBig = [aadhaarFile, idFile].find(f => f && f.type === 'application/pdf' && f.size > 2_800_000)
    if (tooBig) return `"${tooBig.name}" is ${(tooBig.size / 1048576).toFixed(1)} MB. PDFs are not compressed — keep them under 2.8 MB, or upload a photo of the document instead.`
    if (form.passType === 'student' && !idFile) return 'A college / institution ID is required for a Student pass.'
    if (form.passType === 'senior' && (age === null || age < 60))
      return `Senior Citizen pass requires age 60 or above. Date of birth entered gives age ${age}.`
    if (form.passType === 'senior' && !idFile) return 'An age / identity proof is required for a Senior Citizen pass.'
    return ''
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setSubmitting(true)

    const newPassId = genPassId()
    let stage = 'init'
    try {
      stage = 'storage:epass-photos'
      setUploadMsg('Uploading photo…')
      const photoUrl = await uploadTo('epass-photos', `${newPassId}/photo`, photoFile!, 600, 0.82)

      stage = 'storage:epass-docs'
      setUploadMsg('Uploading Aadhaar proof…')
      const aadhaarPath = await uploadTo('epass-docs', `${newPassId}/aadhaar`, aadhaarFile!, 1400, 0.75)

      let idPath: string | null = null
      if (idFile) {
        stage = 'storage:epass-docs'
        setUploadMsg('Uploading institution ID…')
        idPath = await uploadTo('epass-docs', `${newPassId}/institution-id`, idFile, 1400, 0.75)
      }

      stage = 'db:epasses.insert'
      setUploadMsg('Submitting application…')
      const { error } = await supabase.from('epasses').insert({
        pass_id: newPassId,
        holder_name: form.fullName.trim(),
        aadhaar_last4: form.aadhaar.slice(-4),
        mobile: form.mobile,
        dob: form.dob,
        pass_type: form.passType,
        zone: form.zone,
        cfms_id: form.cfmsId,
        institution: form.institution.trim(),
        org_name: form.institution.trim(),   // kept in sync for older readers
        photo_url: photoUrl,
        aadhaar_doc_url: aadhaarPath,
        id_doc_url: idPath,
        payment_method: form.payment,
        amount: AMOUNTS[form.passType] ?? 350,
        valid_from: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        auto_renewal: form.payment === 'upi_autopay',
      })
      if (error) throw error

      // The row is written; now claim the holder credential. claim_epass_token()
      // only answers for a row created in the last ten minutes and only when the
      // registered mobile matches, so the window is tight and self-closing.
      stage = 'db:claim_epass_token'
      setUploadMsg('Securing your pass…')
      const { data: token, error: tokErr } = await supabase.rpc('claim_epass_token', {
        p_pass_id: newPassId, p_mobile: form.mobile,
      })
      if (tokErr || !token) {
        throw new Error('application saved, but this device could not be linked to it — '
          + `note your reference ${newPassId} and contact the depot`)
      }
      saveCred({ passId: newPassId, token: token as string })

      setSubmittedPassId(newPassId)
      setPassStatus('pending')
      setScreen('submitted')
    } catch (e: any) {
      console.error('[ePass submit] stage=%s', stage, e)
      setFormError(`Submission failed at ${stage} — ${describeFailure(stage, e)} Nothing was saved.`)
    } finally {
      setSubmitting(false)
      setUploadMsg('')
    }
  }

  const getAmountLabel = () => `₹${AMOUNTS[form.passType] ?? 350}`

  if (loading) return (
    <div className="phone-shell">
      <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--mute)', fontSize: 13 }}>
        Loading...
      </div>
    </div>
  )

  // ══ SUBMITTED CONFIRMATION ═══════════════════════════════════════════════════
  if (screen === 'submitted') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>

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

          <div style={{
            margin: 14,
            background: passStatus === 'rejected' ? '#FDECEA' : '#E8F5E9',
            border: `1.5px solid ${passStatus === 'rejected' ? '#C0392B' : 'var(--green)'}`,
            borderRadius: 12, padding: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>
              {passStatus === 'active' ? '🎉' : passStatus === 'rejected' ? '❌' : '✅'}
            </div>
            <div style={{
              fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700,
              color: passStatus === 'rejected' ? '#C0392B' : 'var(--green)', marginBottom: 6,
            }}>
              {passStatus === 'active' ? 'ePass Approved — Card Issued'
                : passStatus === 'rejected' ? 'Application Rejected'
                : 'Submitted — Documents Under Verification'}
            </div>
            <div style={{ fontSize: 13, color: passStatus === 'rejected' ? '#C0392B' : '#2E7D32', lineHeight: 1.6 }}>
              {passStatus === 'active'
                ? `Approved at ${approvedAt}. Your ID card is ready under "View My ePass".`
                : passStatus === 'rejected'
                ? (rejectionReason || 'The depot manager could not verify your documents.')
                : 'The depot manager is checking your photo, Aadhaar and institution ID. This page updates automatically.'}
            </div>
          </div>

          {/* Status tracker */}
          <div style={{ margin: '0 14px 12px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Application Status</span>
              {passStatus === 'pending' && (
                <span style={{ fontSize: 10, color: '#4CAF50', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="live-dot" style={{ width: 6, height: 6 }}/> Live
                </span>
              )}
            </div>
            {[
              { label: 'Application + documents submitted', sub: `${time} today`, done: true, current: false },
              {
                label: passStatus === 'active' ? 'Documents verified by Depot Manager'
                  : passStatus === 'rejected' ? 'Rejected by Depot Manager'
                  : 'Document verification in progress',
                sub: passStatus === 'active' ? `Photo, Aadhaar & ID checked at ${approvedAt}`
                  : passStatus === 'rejected' ? (rejectionReason || 'See reason above')
                  : 'Madhurawada Depot — Visakhapatnam',
                done: passStatus === 'active' || passStatus === 'rejected',
                current: passStatus === 'pending',
                rejected: passStatus === 'rejected',
              },
              {
                label: passStatus === 'active' ? 'ID card issued — QR is live' : 'ID card will be issued',
                sub: passStatus === 'active' ? 'Show the card QR to the conductor' : 'Card generates after verification',
                done: passStatus === 'active', current: false,
              },
            ].map((step: any, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: step.rejected ? '#C0392B' : step.done ? 'var(--green)' : step.current ? 'var(--gold)' : '#E2E8F0',
                    border: `2px solid ${step.rejected ? '#C0392B' : step.done ? 'var(--green)' : step.current ? 'var(--gold)' : '#D1DCF0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: step.done ? 'white' : step.current ? 'var(--blue)' : 'var(--mute)', fontWeight: 700,
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

          {/* Documents submitted */}
          <div style={{ margin: '0 14px 12px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Submitted for Verification
            </div>
            {[
              ['Applicant', form.fullName],
              ['Date of Birth', `${fmtDate(form.dob)}${age !== null ? ` (${age} yrs)` : ''}`],
              ['Organisation / Institution', form.institution],
              ['Pass Type', (PASS_LABEL[form.passType]?.en || form.passType)],
              ['Zone', form.zone],
              ['Amount', getAmountLabel()],
              ['Photo', photoFile ? '✓ Uploaded' : '—'],
              ['Aadhaar proof', aadhaarFile ? '✓ Uploaded' : '—'],
              ['Institution / Org ID', idFile ? '✓ Uploaded' : 'Not submitted'],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #F0F4FA' }}>
                <span style={{ fontSize: 12, color: 'var(--mute)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" onClick={() => setScreen('view')}>
              {passStatus === 'active' ? 'View My ID Card' : 'View My ePass'}
            </button>
            <button style={{
              width: '100%', padding: 12, background: 'var(--light)', color: 'var(--blue)',
              border: '1.5px solid var(--blue)', borderRadius: 10, fontFamily: 'Rajdhani,sans-serif',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }} onClick={() => nav('/')}>← Back to Home</button>
          </div>
        </div>
      </div>
    )
  }

  // ══ APPLY SCREEN ═════════════════════════════════════════════════════════════
  if (screen === 'apply') {
    return (
      <div className="phone-shell screen-enter">
        <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>

        <div style={{ background: 'var(--blue)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setScreen('view')} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              border: 'none', color: 'white', fontSize: 16, cursor: 'pointer',
            }}>←</button>
            <div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: 'white' }}>
                Register New ePass
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>కొత్త ఈ-పాస్ నమోదు</div>
            </div>
          </div>
        </div>

        <div className="scrollable" style={{ maxHeight: 'calc(100dvh - 130px)' }}>

          {/* ── Section 1: Identity ── */}
          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              1 · Applicant Details
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 14 }}>
              దరఖాస్తుదారు వివరాలు — no counter visit needed
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Full Name (as per Aadhaar) <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" className="form-input" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="form-label">Aadhaar (12 Digits) <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="tel" inputMode="numeric" maxLength={12} className="form-input" placeholder="XXXX XXXX XXXX"
                  value={form.aadhaar}
                  onChange={e => setForm(f => ({ ...f, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) }))} />
              </div>
              <div>
                <label className="form-label">Mobile (10 Digits) <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="tel" inputMode="numeric" maxLength={10} className="form-input" value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Date of Birth · పుట్టిన తేదీ <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="date" className="form-input" value={form.dob}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
              {age !== null && (
                <div style={{ fontSize: 10, color: age >= 60 ? 'var(--green)' : 'var(--mute)', marginTop: 3 }}>
                  Age {age} years{age >= 60 ? ' — eligible for Senior Citizen pass' : ''}
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Organisation / Institution <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" className="form-input" value={form.institution}
                placeholder="Department, company or college name"
                onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} />
              <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 3 }}>
                This is printed on the ID card — enter the name exactly as on your office/college ID.
              </div>
            </div>
          </div>

          {/* ── Section 2: Documents ── */}
          <div style={{ margin: '0 14px 14px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              2 · Photo &amp; Proof Documents
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 14 }}>
              ఫోటో మరియు ధ్రువీకరణ పత్రాలు — verified by the depot manager before issue
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <UploadTile
                label="Passport-style Photo · ఫోటో"
                sublabel="Plain background, face clearly visible. Printed on the pass."
                required accept="image/*" capture="user"
                file={photoFile} preview={photoPrev}
                onPick={pickWithPreview(setPhotoFile, setPhotoPrev)}
              />
              <UploadTile
                label="Aadhaar Card · ఆధార్ కార్డు"
                sublabel="Front side image or PDF. Only the last 4 digits are stored."
                required accept="image/*,application/pdf" capture="environment"
                file={aadhaarFile} preview={aadhaarPrev}
                onPick={pickWithPreview(setAadhaarFile, setAadhaarPrev)}
              />
              <UploadTile
                label={form.passType === 'student'
                  ? 'College / Institution ID · కళాశాల ఐడీ'
                  : 'Organisation / Employer ID · సంస్థ ఐడీ'}
                sublabel={idDocRequired
                  ? 'Mandatory for this pass type — must show name and validity.'
                  : 'Optional for a general pass, but speeds up verification.'}
                required={idDocRequired} accept="image/*,application/pdf" capture="environment"
                file={idFile} preview={idPrev}
                onPick={pickWithPreview(setIdFile, setIdPrev)}
              />
            </div>

            <div style={{ background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, padding: '9px 11px', marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#78550A', lineHeight: 1.5 }}>
                🔒 Documents are used only for one-time verification by the depot manager and are
                not shown on your pass. Your full Aadhaar number is never stored.
              </div>
            </div>
          </div>

          {/* ── Section 3: Pass configuration ── */}
          <div style={{ margin: '0 14px 14px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              3 · Pass &amp; Payment
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Pass Type · పాస్ రకం</label>
              <select className="form-input" value={form.passType}
                onChange={e => setForm(f => ({ ...f, passType: e.target.value }))}>
                <option value="monthly">Monthly Pass — ₹350</option>
                <option value="daily">Daily Pass — ₹50</option>
                <option value="student">Student Pass — ₹150</option>
                <option value="senior">Senior Citizen Pass — ₹175</option>
              </select>
              {form.passType === 'senior' && age !== null && age < 60 && (
                <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
                  ⚠ Age {age} — Senior Citizen pass requires 60 years or above.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Zone of Validity · జోన్</label>
              <select className="form-input" value={form.zone}
                onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}>
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 3 }}>
                The pass is valid on every city service inside the selected zone.
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">CFMS / Student Roll No.</label>
              <input type="text" className="form-input" value={form.cfmsId}
                onChange={e => setForm(f => ({ ...f, cfmsId: e.target.value }))} />
            </div>

            <div>
              <label className="form-label">Payment Method</label>
              <select className="form-input" value={form.payment}
                onChange={e => setForm(f => ({ ...f, payment: e.target.value }))}>
                <option value="upi_autopay">UPI Autopay (auto-renew monthly)</option>
                <option value="upi_onetime">UPI One-time</option>
                <option value="net_banking">Net Banking</option>
              </select>
            </div>
          </div>

          {/* ── Submit ── */}
          <div style={{ margin: '0 14px 20px' }}>
            {formError && (
              <div style={{
                background: '#FDECEA', border: '1px solid #EF9A9A', borderRadius: 8,
                padding: '10px 12px', fontSize: 12, color: '#C0392B', marginBottom: 10, lineHeight: 1.5,
              }}>⚠ {formError}</div>
            )}
            {submitting && uploadMsg && (
              <div style={{
                background: 'var(--light)', borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: 'var(--blue)', marginBottom: 10, fontWeight: 600,
              }}>⏳ {uploadMsg}</div>
            )}
            <button className="btn-teal" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : '✓ SUBMIT FOR VERIFICATION'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', marginTop: 10, lineHeight: 1.5 }}>
              Total payable {getAmountLabel()} · charged only after the depot manager approves your documents.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══ VIEW / ID CARD ═══════════════════════════════════════════════════════════
  return (
    <div className="phone-shell screen-enter">
      <div className="status-bar"><span>{time}</span><span>APCityPrayaanam • 4G</span></div>

      <div style={{ background: 'var(--blue)', padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, fontWeight: 700, color: 'white' }}>
              My ePass
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>నా ఈ-పాస్</div>
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
          <>
            <PassIdCard pass={existingPass} />
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', margin: '-4px 14px 14px' }}>
              Tap the card to see zone, date of birth and conditions of use.
            </div>
          </>
        ) : (
          <div style={{ margin: 14, background: 'white', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🪪</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No Active ePass</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 16 }}>
              Register for a city bus pass to travel without buying tickets every day.
            </div>
          </div>
        )}

        <div style={{ padding: '0 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {existingPass ? 'Manage Pass' : 'Register New ePass'}
        </div>

        <div style={{ margin: '0 14px 14px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <button className="btn-teal" onClick={() => setScreen('apply')}>
            + APPLY FOR NEW ePASS
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mute)', marginTop: 10 }}>
            Photo + Aadhaar + institution ID · verified by depot manager · UPI payment
          </div>
        </div>

        <div style={{ margin: '0 14px 20px', background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Pass Benefits
          </div>
          {[
            ['🪪', 'Photo ID card on your phone', 'Conductor verifies face, name and validity in one look'],
            ['💰', 'Save up to 40% vs daily tickets', 'Monthly pass at ₹350 vs ₹600+ in daily fares'],
            ['🔄', 'Auto-renewal via UPI', 'Auto-deducts 3 days before expiry — no lapse'],
            ['📱', 'No counter visit, no physical card', 'Apply, upload proofs and get approved from home'],
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
