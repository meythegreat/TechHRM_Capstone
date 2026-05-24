import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import axios from 'axios'
import './index.css'

// In dev, Vite proxies /api to Laravel (see vite.config.ts) — avoids CORS issues.
axios.defaults.baseURL = import.meta.env.DEV ? '' : 'http://localhost:8000'
axios.defaults.withCredentials = true

// Attach Bearer token automatically (persisted login)
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
