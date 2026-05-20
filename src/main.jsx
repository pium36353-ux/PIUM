import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const hostname = window.location.hostname
const isMainApp = hostname === 'www.piumapp.com' || hostname === 'piumapp.com' || hostname === 'localhost' || hostname === '127.0.0.1'

if (isMainApp) {
  // Inject PWA manifest and Apple meta tags only on the main app domain
  const manifest = document.createElement('link')
  manifest.rel   = 'manifest'
  manifest.href  = '/manifest.json'
  document.head.appendChild(manifest)

  const themeColor = document.createElement('meta')
  themeColor.name    = 'theme-color'
  themeColor.content = '#111827'
  document.head.appendChild(themeColor)

  const appleMeta = [
    { name: 'apple-mobile-web-app-capable',          content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title',            content: 'PIUM' },
  ]
  appleMeta.forEach(({ name, content }) => {
    const m = document.createElement('meta')
    m.name    = name
    m.content = content
    document.head.appendChild(m)
  })

  const appleIcon = document.createElement('link')
  appleIcon.rel  = 'apple-touch-icon'
  appleIcon.href = '/favicon.svg'
  document.head.appendChild(appleIcon)

  if ('serviceWorker' in navigator) {
    if (document.readyState === 'complete') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    } else {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }, { once: true })
    }
  }
} else {
  // Public subdomain: unregister any previously installed SW to clean up
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister())
    })
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
