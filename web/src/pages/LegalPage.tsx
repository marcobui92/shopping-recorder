import { Link } from 'react-router-dom'

type LegalPageProps = { kind: 'privacy' | 'terms' }

export function LegalPage({ kind }: LegalPageProps) {
  const privacy = kind === 'privacy'
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link className="text-sm font-semibold text-primary hover:underline" to="/">← Back to PackTrace</Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-primary">PackTrace</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: September 21, 2026</p>

      {privacy ? <div className="prose mt-10 max-w-none text-sm leading-7 text-muted-foreground">
        <p>PackTrace helps operators record packing and unpacking evidence for their own operational records. This policy explains what we collect and how we use it.</p>
        <h2>Information we collect</h2>
        <p>We collect the username, optional email address, activity details, and evidence files that you choose to submit. We also store security data needed to keep your session and uploads safe.</p>
        <h2>Storage and Google Drive</h2>
        <p>Evidence is stored in the application storage configured by the service or, when you choose it, in your connected Google Drive. Google Drive access is optional and limited to files created by PackTrace. We store encrypted authorization tokens so the connection can be maintained.</p>
        <h2>How we use information</h2>
        <p>We use this information to authenticate you, store and verify evidence, show your records, provide downloads, and operate security and cleanup workflows. We do not sell personal information or use evidence for advertising.</p>
        <h2>Your choices</h2>
        <p>You can correct activity metadata, delete completed activities, disconnect Google Drive, or contact the service owner about account data. Disconnecting Google Drive does not delete files already stored there.</p>
        <h2>Security and retention</h2>
        <p>Sessions, provider credentials, and evidence access are protected with application controls and encryption in transit. Stored evidence is deleted 30 days after the record is completed; record metadata remains available with an expired status.</p>
        <h2>Contact</h2>
        <p>For privacy questions or data requests, contact the PackTrace service owner through the support channel provided with your deployment.</p>
      </div> : <div className="prose mt-10 max-w-none text-sm leading-7 text-muted-foreground">
        <p>These Terms govern your use of PackTrace, an operational workspace for recording packing and unpacking evidence.</p>
        <h2>Your account</h2>
        <p>You are responsible for keeping your credentials private and for activity recorded under your account. Provide accurate information and do not share access to evidence you are required to protect.</p>
        <h2>Acceptable use</h2>
        <p>Use the service lawfully and only for evidence you are authorized to collect and store. Do not attempt to bypass access controls, upload malicious content, interfere with the service, or access another operator's records.</p>
        <h2>Storage providers</h2>
        <p>The service may use application storage and optional Google Drive storage. Provider availability, quotas, and outages can affect uploads and retrieval. You remain responsible for choosing an appropriate storage provider and retaining any required business copy.</p>
        <h2>Evidence and deletion</h2>
        <p>You retain responsibility for the content you submit. Deleting an activity removes it from the application and starts provider cleanup; provider-side cleanup may take time after an outage or disconnected account.</p>
        <h2>Availability</h2>
        <p>PackTrace is provided as configured for your deployment. Features may be changed to maintain security, comply with provider requirements, or improve the service.</p>
        <h2>Contact</h2>
        <p>For support or terms questions, contact the PackTrace service owner through the support channel provided with your deployment.</p>
      </div>}
    </article>
  )
}
