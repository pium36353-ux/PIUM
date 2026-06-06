import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        minHeight:      '100vh',
        backgroundColor:'#f5f5f5',
        fontFamily:     'inherit',
        padding:        '24px',
      }}>
        <div style={{
          background:   '#ffffff',
          borderRadius: '12px',
          boxShadow:    '0 4px 24px rgba(0,0,0,0.08)',
          padding:      '40px 32px',
          maxWidth:     '420px',
          width:        '100%',
          textAlign:    'center',
        }}>
          <p style={{
            fontSize:   '32px',
            margin:     '0 0 12px',
            lineHeight: 1,
          }}>⚠️</p>
          <h2 style={{
            fontSize:   '20px',
            fontWeight: 600,
            color:      '#1a1a1a',
            margin:     '0 0 8px',
          }}>
            Qualcosa è andato storto
          </h2>
          <p style={{
            fontSize: '15px',
            color:    '#555555',
            margin:   '0 0 28px',
            lineHeight: 1.5,
          }}>
            Si è verificato un errore imprevisto.<br />
            Prova a ricaricare la pagina.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#7c3aed',
              color:           '#ffffff',
              border:          'none',
              borderRadius:    '8px',
              padding:         '10px 24px',
              fontSize:        '15px',
              fontWeight:      500,
              cursor:          'pointer',
            }}
          >
            Ricarica la pagina
          </button>
        </div>
      </div>
    )
  }
}
