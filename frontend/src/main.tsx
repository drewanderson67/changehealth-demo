import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const ready = import.meta.env.VITE_STATIC_DEMO === 'true'
  ? import('./demo/staticApi').then(m => m.installStaticApi())
  : Promise.resolve()

ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
