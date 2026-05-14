import { useNavigate } from 'react-router-dom'

function Placeholder({ title, next }: { title: string, next?: string }) {
  const nav = useNavigate()
  return (
    <div className="phone-shell">
      <div className="status-bar">
        <span>9:41 AM</span><span>APSRTC APCityPrayaanam</span>
      </div>
      <div style={{background:'var(--blue)',padding:'14px 16px',display:'flex',alignItems:'center',gap:10}}>
        <button onClick={()=>nav(-1)} style={{width:30,height:30,borderRadius:'50%',background:'rgba(255,255,255,0.15)',border:'none',color:'white',fontSize:16,cursor:'pointer'}}>←</button>
        <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:18,fontWeight:700,color:'white'}}>{title}</div>
      </div>
      <div style={{padding:16}}>
        <div style={{background:'white',borderRadius:12,padding:16,boxShadow:'var(--shadow)'}}>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:8}}>
            {title} — coming in Session {next}
          </div>
          <div style={{fontSize:13,color:'var(--mute)'}}>
            This screen will be fully built in the upcoming session.
          </div>
          <button className="btn-primary" style={{marginTop:14}} onClick={()=>nav('/')}>← Back to Home</button>
        </div>
      </div>
    </div>
  )
}

export function BusDetail() { return <Placeholder title="Bus Detail"  next="4" /> }
export function EPass()     { return <Placeholder title="ePass"       next="5" /> }
export function Timetable() { return <Placeholder title="Timetable"   next="6" /> }

