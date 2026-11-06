import { useRef, useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { contactEmail } from './lib/contactConfig'
import { buildContactMailto, contactMessageLimit, contactRecipient, contactTopics, ContactDraftError, formatContactNote, type ContactDraft } from './lib/contact'

interface ContactPageProps {
  initialDraft: ContactDraft
  onDraftChange: (draft: ContactDraft) => void
  recipient?: string
}

export function ContactPage({ initialDraft, onDraftChange, recipient = contactEmail }: ContactPageProps) {
  const address = contactRecipient(recipient)
  const [draft, setDraft] = useState(() => ({ ...initialDraft }))
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [prepared, setPrepared] = useState(''), [busy, setBusy] = useState(false)
  const preview = useRef<HTMLTextAreaElement>(null), revision = useRef(0)

  function change<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    revision.current++
    const next = { ...draft, [key]: value }
    setDraft(next); onDraftChange(next)
    setError(''); setNotice(''); setPrepared('')
  }

  function selectPreparedNote() {
    requestAnimationFrame(() => { preview.current?.focus(); preview.current?.select() })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(''); setNotice('')
    let note: string
    try { note = formatContactNote(draft) }
    catch (error) {
      setError(error instanceof Error ? error.message : 'Check your note and try again.')
      if (error instanceof ContactDraftError) document.getElementById(`contact-${error.field}`)?.focus()
      return
    }
    setPrepared(note)
    const version = revision.current
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    if (address && button?.value !== 'copy') {
      try {
        window.location.assign(buildContactMailto(address, draft))
        setNotice('Your email app handles sending. Your note is still available below; opening a draft does not confirm delivery.')
      } catch {
        setError('The email draft could not open. Copy your prepared note below instead.')
        selectPreparedNote()
      }
      return
    }
    setBusy(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(note)
      if (revision.current === version) setNotice('Note copied. It has not been sent.')
    } catch {
      if (revision.current === version) {
        setNotice('Automatic copying is unavailable. Select the prepared note below and copy it manually. It has not been sent.')
        selectPreparedNote()
      }
    } finally { setBusy(false) }
  }

  return <section className="contact-page" aria-labelledby="contact-title">
    <div className="page-heading"><div><h1 id="contact-title">Contact us & feedback<span className="heading-period">.</span></h1><p className="subheading">Ask a question, report a problem or tell us what could be better.</p></div></div>
    <section className="panel contact-panel" aria-labelledby="contact-form-title">
      <h2 id="contact-form-title">Write your note</h2>
      <p className="contact-delivery-note">{address ? 'Open a prefilled draft in your email app, then send it there. You can also copy the note.' : 'Email delivery is being set up. For now, write your note and copy it to keep a copy.'}</p>
      <form onSubmit={event => void submit(event)} aria-label="Contact us and feedback">
        <div className="contact-details-grid">
          <label className="field" htmlFor="contact-name">Full name<input id="contact-name" autoComplete="name" required minLength={2} maxLength={80} value={draft.name} onChange={event => change('name', event.target.value)} /></label>
          <label className="field" htmlFor="contact-email">Reply email address<input id="contact-email" type="email" autoComplete="email" required maxLength={254} value={draft.email} onChange={event => change('email', event.target.value)} /></label>
        </div>
        <label className="field" htmlFor="contact-topic">Type of note<span className="select-wrap"><select id="contact-topic" value={draft.topic} onChange={event => change('topic', event.target.value as ContactDraft['topic'])}>{Object.entries(contactTopics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></span></label>
        <label className="field" htmlFor="contact-message">Your message<textarea id="contact-message" required minLength={10} maxLength={contactMessageLimit} rows={7} value={draft.message} onChange={event => change('message', event.target.value)} aria-describedby="contact-message-help contact-character-count" placeholder="What would you like to share?" /></label>
        <div className="contact-message-help"><small id="contact-message-help">10–4,000 characters. Only the details you type are included; investments and statements are not attached.</small><span id="contact-character-count">{draft.message.length.toLocaleString()} / {contactMessageLimit.toLocaleString()}</span></div>
        {error && <p className="validation-error" role="alert">{error}</p>}
        <div className="contact-actions"><button type="submit" name="action" value={address ? 'email' : 'copy'} className="button button-primary" disabled={busy}>{busy ? 'Copying…' : address ? 'Open email draft' : 'Copy note'}</button>{address && <button type="submit" name="action" value="copy" className="button button-quiet" disabled={busy}>Copy note</button>}</div>
      </form>
      {notice && <p className="contact-notice" role="status">{notice}</p>}
      {prepared && <div className="contact-preview"><label className="field" htmlFor="contact-prepared">Prepared note<textarea ref={preview} id="contact-prepared" readOnly rows={8} value={prepared} /></label></div>}
      <p className="contact-session-note">Your draft stays open as you move between sections. Reloading or logging out clears it.</p>
    </section>
  </section>
}
