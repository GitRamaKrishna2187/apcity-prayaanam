import { useLang } from '../i18n/LanguageContext'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const { t } = useLang()
  const nav = useNavigate()
  return (
    <div className="phone-shell">
      <div className="status-bar">
        <span>9:41 AM</span>
        <span>APSRTC APCityPrayaanam</span>
      </div>
      <div className="app-header">
        <div className="header-top">
          <div>
            <div className="app-logo">AP <span>CITY</span></div>
            <span className="app-sub">ఏపీసిటీ ప్రయాణం — APSRTC</span>
          </div>
        </div>
        <div style={{background:'white',borderRadius:12,padding:16}}>
          <div style={{marginBottom:10,fontSize:14,color:'#7A8BA6'}}>Session 1 complete ✓</div>
          <div style={{marginBottom:10,fontSize:13,color:'#1C2B4A',fontWeight:600}}>
            Database connected. Home screen coming in Session 2.
          </div>
          <button className="btn-primary" onClick={()=>nav('/buses')}>
            Try Bus Search →
          </button>
        </div>
        <div className="apsrtc-watermark">APSRTC</div>
      </div>
      <div style={{padding:16}}>
        <div style={{background:'white',borderRadius:12,padding:14,marginBottom:12,boxShadow:'var(--shadow)'}}>
          <div style={{fontSize:12,fontWeight:600,color:'var(--mute)',marginBottom:8,textTransform:'uppercase'}}>
            Setup Status
          </div>
          <div style={{fontSize:13,color:'var(--text)',marginBottom:4}}>✅ React app — running</div>
          <div style={{fontSize:13,color:'var(--text)',marginBottom:4}}>✅ Supabase — connected</div>
          <div style={{fontSize:13,color:'var(--text)',marginBottom:4}}>✅ Vercel — deployed</div>
          <div style={{fontSize:13,color:'var(--text)',marginBottom:4}}>✅ Language system — ready</div>
          <div style={{fontSize:13,color:'var(--text)'}}>✅ All 7 database tables — created</div>
        </div>
      </div>
      <div className="bottom-nav">
        {['🏠','🚌','🪪','⏰','👤'].map((icon,i)=>
          <button key={i} className={`nav-item${i===0?' active':''}`}>
            <div className="nav-icon">{icon}</div>
            {i===0&&<div className="nav-dot"/>}
            <div className="nav-label">{['Home','Buses','ePass','Timetable','Profile'][i]}</div>
          </button>
        )}
      </div>
    </div>
  )
}
