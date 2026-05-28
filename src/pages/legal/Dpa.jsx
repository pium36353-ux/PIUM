import LegalPage from './LegalPage'
import content from '../../../legal-docs/dpa.md?raw'

export default function Dpa() {
  return <LegalPage title="DPA" content={content} />
}
