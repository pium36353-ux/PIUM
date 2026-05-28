import LegalPage from './LegalPage'
import content from '../../../legal-docs/privacy-policy.md?raw'

export default function Privacy() {
  return <LegalPage title="Privacy Policy" content={content} />
}
