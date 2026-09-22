import { useState, useEffect } from 'react'
import QRLib from 'qrcode'

// ─────────────────────────────────────────────────────────────────────────────
// Shared credential primitives for ePass and e-Ticket.
//
// These previously lived inside EPass.tsx. Ticketing needs the identical
// rotating-code algorithm — it must agree byte for byte with totp_code() in
// Postgres — so copying it into a second file would have been one edit away
// from two implementations that silently disagree.
// ─────────────────────────────────────────────────────────────────────────────

// ── Real QR encoding ─────────────────────────────────────────────────────────
export function QRCode({ value, size = 120 }: { value: string; size?: number }) {
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
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }}
    />
  )
}

// ── Rotating code ────────────────────────────────────────────────────────────
// Mirrors totp_code(secret, step) in the database exactly:
//   HMAC-SHA256(key = secret, msg = step) → first 8 bytes big-endian
//   → AND 0x7FFFFFFF → mod 1e6 → zero-pad to 6.
// Change one side and you must change the other.
export function useRotatingCode(secret: string | null | undefined) {
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

// ── The expiry bar drawn under every rotating QR ─────────────────────────────
export function CodeExpiryBar({ remaining }: { remaining: number }) {
  return (
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
  )
}

// ── Local credential storage ─────────────────────────────────────────────────
// Anon cannot SELECT from epasses or tickets. Each credential is read back with
// its own reference + token, held only in this browser.
export type Cred = { passId: string; token: string }
export type TicketCred = { ticketNo: string; token: string }

export const CRED_KEY = 'apcp.epass.cred'
export const TICKETS_KEY = 'apcp.tickets'

export function loadCred(): Cred | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    return raw ? JSON.parse(raw) as Cred : null
  } catch { return null }
}
export function saveCred(c: Cred) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

// Tickets accumulate, so this is a list rather than a single slot. Capped at 20
// so a heavy user's storage does not grow without bound.
export function loadTicketCreds(): TicketCred[] {
  try {
    const raw = localStorage.getItem(TICKETS_KEY)
    return raw ? JSON.parse(raw) as TicketCred[] : []
  } catch { return [] }
}
export function saveTicketCred(c: TicketCred) {
  try {
    const all = loadTicketCreds().filter(t => t.ticketNo !== c.ticketNo)
    localStorage.setItem(TICKETS_KEY, JSON.stringify([c, ...all].slice(0, 20)))
  } catch { /* private mode */ }
}
