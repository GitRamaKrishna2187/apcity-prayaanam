import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext'
import './index.css'

import Home from './pages/Home'
import Buses from './pages/Buses'
import BusDetail from './pages/BusDetail'
import EPass from './pages/EPass'
import Timetable from './pages/Timetable'
import Profile from './pages/Profile'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/buses"     element={<Buses />} />
          <Route path="/bus/:id"   element={<BusDetail />} />
          <Route path="/epass"     element={<EPass />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/profile"   element={<Profile />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
)
