import LegalPage from './LegalPage'
import content from '../../../legal-docs/termini-servizio.md?raw'

export default function Termini() {
  return <LegalPage title="Termini di Servizio" content={content} />
}
