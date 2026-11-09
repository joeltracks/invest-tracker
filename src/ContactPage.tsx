import { useRef, useState, type FormEvent } from 'react'
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

  return (
    <section className="contact-page" aria-labelledby="contact-title">
      <div className="page-heading">
        <div>
          <h1 id="contact-title">Tell us what you think<span className="heading-period">.</span></h1>
          <p className="subheading">Your feedback helps us fix problems and improve Yieldwise. It takes about a minute.</p>
        </div>
      </div>

      <section className="panel contact-panel" aria-label="Feedback form">
        <form onSubmit={event => void submit(event)} aria-label="Contact us and feedback">
          <fieldset className="contact-choice-group">
            <legend>What kind of feedback is this?</legend>
            <div className="contact-topics" id="contact-topic">
              {Object.entries(contactTopics).map(([value, label]) => (
                <label className="contact-choice" key={value}>
                  <input className="sr-only" type="radio" name="feedback-topic" value={value}
                    checked={draft.topic === value} onChange={() => change('topic', value as ContactDraft['topic'])} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="contact-choice-group" aria-describedby="contact-rating-scale">
            <legend>How was your experience? <small>(optional)</small></legend>
            <div className="contact-ratings" id="contact-rating">
              {[1, 2, 3, 4, 5].map(value => (
                <label className="contact-choice" key={value}>
                  <input className="sr-only" type="radio" name="feedback-rating" value={value}
                    aria-label={value === 1 ? '1, Poor' : value === 5 ? '5, Excellent' : String(value)}
                    checked={draft.rating === value} onChange={() => change('rating', value)} />
                  <span>{value}</span>
                </label>
              ))}
            </div>
            <div className="contact-rating-scale" id="contact-rating-scale"><span>Poor</span><span>Excellent</span></div>
          </fieldset>

          <div className="contact-message">
            <label className="field" htmlFor="contact-message">
              Your feedback
              <textarea id="contact-message" required minLength={10} maxLength={contactMessageLimit} rows={6}
                value={draft.message} onChange={event => change('message', event.target.value)}
                aria-describedby="contact-message-help contact-character-count"
                placeholder="Tell us what happened or what you’d like to see." />
            </label>
            <div className="contact-message-help">
              <small id="contact-message-help">At least 10 characters.</small>
              <span id="contact-character-count">{draft.message.length.toLocaleString()} / {contactMessageLimit.toLocaleString()}</span>
            </div>
          </div>

          <label className="field" htmlFor="contact-email">
            <span>Email <small>(optional, only if you’d like a reply)</small></span>
            <input id="contact-email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com"
              value={draft.email} onChange={event => change('email', event.target.value)} />
          </label>

          {error && <p className="validation-error" role="alert">{error}</p>}
          <div className="contact-actions">
            <button type="submit" name="action" value={address ? 'email' : 'copy'} className="button button-primary" disabled={busy}>
              {busy ? 'Copying…' : address ? 'Open email draft' : 'Copy note'}
            </button>
            <p className="contact-delivery-note">
              {address ? 'Send your feedback from your email app once the draft opens.' : 'Email delivery is being set up. Copy your feedback to save it.'}
            </p>
            {address && <button type="submit" name="action" value="copy" className="button button-quiet" disabled={busy}>Copy note</button>}
          </div>
        </form>
        {notice && <p className="contact-notice" role="status">{notice}</p>}
        {prepared && <div className="contact-preview"><label className="field" htmlFor="contact-prepared">Prepared note<textarea ref={preview} id="contact-prepared" readOnly rows={8} value={prepared} /></label></div>}
      </section>
    </section>
  )
}
