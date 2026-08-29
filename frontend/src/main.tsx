import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted Inter (variable weight axis): bundled by Vite, no external font request.
import '@fontsource-variable/inter'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
