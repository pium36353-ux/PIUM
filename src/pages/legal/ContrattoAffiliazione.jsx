import LegalPage from './LegalPage'
import content from '../../../legal-docs/contratto-affiliazione.md?raw'

export default function ContrattoAffiliazione() {
  return <LegalPage title="Contratto di Affiliazione PIUM" content={content} />
}
