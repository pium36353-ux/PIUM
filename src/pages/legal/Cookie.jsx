import LegalPage from './LegalPage'
import content from '../../../legal-docs/cookie-policy.md?raw'

export default function Cookie() {
  return <LegalPage title="Cookie Policy" content={content} />
}
