import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './parent.css'
import App from './App'
import { installTranslateGuard } from './lib/translateSafe'
import { startI18n } from './lib/i18n'

installTranslateGuard()
startI18n()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
