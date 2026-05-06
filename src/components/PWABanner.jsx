import { useState, useEffect } from 'react'
import Logo from './Logo'

const DISMISS_KEY = 'pium_pwa_banner_dismissed'

export default function PWABanner() {
  const [mode, setMode] = useState(null) // null | 'install' | 'open'
  const [installPrompt, setInstallPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem(DISMISS_KEY)) return

    const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (!isMobile) return

    if ('getInstalledRelatedApps' in navigator) {
      navigator.getInstalledRelatedApps().then(apps => {
        if (apps.length > 0 && !sessionStorage.getItem(DISMISS_KEY)) {
          setMode('open')
          setVisible(true)
        }
      })
    }

    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setMode('install')
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') dismiss()
    setInstallPrompt(null)
  }

  const handleOpen = () => {
    window.location.href = window.location.origin
  }

  if (!visible || !mode) return null

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-left">
        <Logo className="pwa-banner-logo" />
        <span className="pwa-banner-text">
          {mode === 'install' ? "Installa l'app PIUM" : "Apri nell'app"}
        </span>
      </div>
      <div className="pwa-banner-right">
        <button
          className="pwa-banner-btn"
          onClick={mode === 'install' ? handleInstall : handleOpen}
        >
          {mode === 'install' ? 'Installa' : 'Apri'}
        </button>
        <button className="pwa-banner-close" onClick={dismiss} aria-label="Chiudi">
          <IconX />
        </button>
      </div>
    </div>
  )
}

function IconX() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
