import { useRef, useState, type FormEvent } from 'react'
import { Instagram, Mail } from 'lucide-react'
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
    if (address) {
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

      <nav className="contact-direct-links" aria-label="Direct contact">
        <a className="button button-quiet" href="https://www.instagram.com/prodbyjo_el/" target="_blank" rel="noopener noreferrer">
          <Instagram size={18} aria-hidden="true" />
          Instagram
        </a>
        <a className="button button-quiet" href="mailto:joeltracks11141@outlook.com">
          <Mail size={18} aria-hidden="true" />
          Email
        </a>
      </nav>

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

          <div className="field">
            <label htmlFor="contact-email">Email address</label>
            <input id="contact-email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com"
              required aria-describedby="contact-email-help" value={draft.email}
              onChange={event => change('email', event.target.value)} />
            <small id="contact-email-help">Your email helps us understand where feedback comes from and follow up when needed.</small>
          </div>

          {error && <p className="validation-error" role="alert">{error}</p>}
          <div className="contact-actions">
            <button type="submit" aria-describedby="contact-delivery-note" className="button button-primary" disabled={busy}>
              {busy ? 'Copying…' : 'Send feedback'}
            </button>
            <p className="contact-delivery-note" id="contact-delivery-note">
              {address ? 'Send your feedback from your email app once the draft opens.' : 'Email delivery is unavailable here. This button copies your feedback.'}
            </p>
          </div>
        </form>
        {notice && <p className="contact-notice" role="status">{notice}</p>}
        {prepared && <div className="contact-preview"><label className="field" htmlFor="contact-prepared">Prepared note<textarea ref={preview} id="contact-prepared" readOnly rows={8} value={prepared} /></label></div>}
      </section>
    </section>
  )
}
