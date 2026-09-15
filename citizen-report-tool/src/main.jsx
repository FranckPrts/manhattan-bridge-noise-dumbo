import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const isAdmin = window.location.pathname === '/admin'
// Lazy-loaded so citizens never download the admin bundle (Leaflet etc.).
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? (
      <Suspense fallback={<div className="app"><p className="hint">Loading…</p></div>}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
