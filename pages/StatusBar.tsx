import { useState, useEffect } from 'react'

export default function StatusBar() {
  const getIST = () =>
    new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })

  const [time, setTime] = useState(getIST())

  useEffect(() => {
    const t = setInterval(() => setTime(getIST()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background: 'var(--blue)',
      padding: '10px 20px 6px',
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
