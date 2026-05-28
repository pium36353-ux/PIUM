import { Link } from 'react-router-dom'
import Logo from '../../components/Logo'

const pageStyle = {
  minHeight: '100vh',
  background: '#f8fafc',
  color: '#0f172a',
  padding: '32px 20px',
}

const shellStyle = {
  maxWidth: 900,
  margin: '0 auto',
}

const navStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  marginBottom: 32,
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '32px',
  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
}

const titleStyle = {
  margin: '0 0 20px',
  fontSize: 'clamp(28px, 4vw, 42px)',
  lineHeight: 1.1,
}

const contentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontSize: 16,
  lineHeight: 1.7,
}

const headingStyle = {
  margin: '18px 0 2px',
  fontSize: 24,
  lineHeight: 1.25,
}

const subheadingStyle = {
  margin: '12px 0 0',
  fontSize: 18,
  lineHeight: 1.35,
}

const paragraphStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
}

function renderMarkdown(markdown) {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)

  return blocks.map((block, index) => {
    const text = block.trim()
    if (!text) return null

    if (text.startsWith('## ')) {
      return <h3 key={index} style={subheadingStyle}>{text.slice(3)}</h3>
    }

    if (text.startsWith('# ')) {
      return <h2 key={index} style={headingStyle}>{text.slice(2)}</h2>
    }

    return <p key={index} style={paragraphStyle}>{text}</p>
  })
}

export default function LegalPage({ title, content }) {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <nav style={navStyle}>
          <Link to="/" aria-label="Torna alla home" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Logo />
          </Link>
          <Link to="/" style={{ color: '#2563eb', fontSize: 14 }}>
            Torna alla home
          </Link>
        </nav>

        <article style={cardStyle}>
          <h1 style={titleStyle}>{title}</h1>
          <div style={contentStyle}>
            {renderMarkdown(content)}
          </div>
        </article>
      </div>
    </main>
  )
}
