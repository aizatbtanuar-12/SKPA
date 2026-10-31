import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './parent.css'
import App from './App'
import { installTranslateGuard } from './lib/translateSafe'

installTranslateGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
