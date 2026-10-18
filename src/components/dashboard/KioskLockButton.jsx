import { useState, useRef, useEffect } from 'react'
import { KIOSK_AREAS, enterFullscreen } from '../../lib/kiosk'

const LONG_PRESS_MS = 1200

// Pulsante lucchetto, condiviso da Tavoli.jsx, Ordine.jsx e Cucina.jsx —
// una sola implementazione di pressione lunga e tastierino, altrimenti le
// tre sezioni finirebbero con comportamenti leggermente diversi (stesso
// principio di kitchenRouting.js nel Blocco D).
//
// Blocco: tocco singolo. Lo schermo intero viene chiesto qui dentro,
// nel gestore del tocco, perché il browser lo concede solo durante un
// gesto dell'utente.
// Sblocco: pressione lunga (1,2 s), poi il codice di 4 cifre se il
// titolare ne ha impostato uno. Un tocco breve da bloccato non fa nulla:
// è esattamente l'uscita involontaria che questo pulsante deve evitare.
export default function KioskLockButton({ area, lockedArea, pin, onLock, onUnlock }) {
  const isLocked = !!lockedArea
  const [pressing,   setPressing]   = useState(false)
  const [pinOpen,    setPinOpen]    = useState(false)
  const [pinDigits,  setPinDigits]  = useState('')
  const [pinError,   setPinError]   = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const beginUnlock = () => {
    if (pin) { setPinDigits(''); setPinError(false); setPinOpen(true); return }
    onUnlock()
  }

  const handlePointerDown = () => {
    if (!isLocked) return
    setPressing(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setPressing(false)
      beginUnlock()
    }, LONG_PRESS_MS)
  }

  const cancelPress = () => {
    setPressing(false)
    clearTimeout(timerRef.current)
  }

  const handleClick = () => {
    if (isLocked) return // da bloccato conta solo la pressione lunga
    enterFullscreen()
    onLock(area)
  }

  const submitPin = () => {
    if (pinDigits === pin) {
      setPinOpen(false)
      setPinDigits('')
      onUnlock()
      return
    }
    setPinError(true)
    setPinDigits('')
  }

  const pressDigit = (d) => {
    if (pinDigits.length >= 4) return
    const next = pinDigits + d
    setPinDigits(next)
    setPinError(false)
    if (next.length === 4) {
      // Verifica appena la quarta cifra è inserita, senza un "conferma"
      // in più: con un codice di 4 cifre non serve.
      if (next === pin) { setPinOpen(false); setPinDigits(''); onUnlock() }
      else { setPinError(true); setPinDigits('') }
    }
  }

  const label = isLocked
    ? `Area ${KIOSK_AREAS[lockedArea]?.label ?? lockedArea} bloccata — tieni premuto per sbloccare`
    : `Blocca su area ${KIOSK_AREAS[area]?.label ?? area}`

  return (
    <>
      <button
        type="button"
        className={`kio-lock-btn ${isLocked ? 'kio-lock-btn--locked' : ''} ${pressing ? 'kio-lock-btn--pressing' : ''}`}
        title={label}
        aria-label={label}
        aria-pressed={isLocked}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
      >
        {isLocked ? <IconLockClosed /> : <IconLockOpen />}
        <span className="kio-lock-text">
          {isLocked ? KIOSK_AREAS[lockedArea]?.label ?? 'Bloccato' : 'Blocca'}
        </span>
      </button>

      {pinOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPinOpen(false)}>
          <div className="sv-modal kio-pin-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Codice di sblocco</h2>
            </div>
            <div className="sv-modal-body">
              <div className="kio-pin-dots">
                {[0, 1, 2, 3].map(i => (
                  <span key={i} className={`kio-pin-dot ${pinDigits.length > i ? 'kio-pin-dot--filled' : ''}`} />
                ))}
              </div>
              {pinError && <p className="sv-field-error" style={{ textAlign: 'center' }}>Codice errato.</p>}
              <div className="kio-pin-pad">
                {['1','2','3','4','5','6','7','8','9'].map(d => (
                  <button key={d} type="button" className="kio-pin-key" onClick={() => pressDigit(d)}>{d}</button>
                ))}
                <button type="button" className="kio-pin-key kio-pin-key--wide" onClick={() => pressDigit('0')}>0</button>
                <button type="button" className="kio-pin-key" onClick={() => { setPinDigits(''); setPinError(false) }}>C</button>
              </div>
            </div>
            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setPinOpen(false)}>Annulla</button>
              <button className="sv-btn-save" onClick={submitPin} disabled={pinDigits.length !== 4}>Sblocca</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function IconLockClosed() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function IconLockOpen()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> }
