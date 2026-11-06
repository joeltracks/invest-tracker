export const contactTopics = { question: 'Question', feedback: 'Feedback', issue: 'Report a problem' } as const
export type ContactTopic = keyof typeof contactTopics
export interface ContactDraft { name: string; email: string; topic: ContactTopic; message: string }
export const contactMessageLimit = 4000

const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
export function contactRecipient(value: string): string | null {
  const email = value.trim()
  return email.length <= 254 && emailPattern.test(email) ? email : null
}

export class ContactDraftError extends Error {
  constructor(public field: keyof ContactDraft, message: string) { super(message); this.name = 'ContactDraftError' }
}

export function newContactDraft(profile?: { name: string; email: string } | null): ContactDraft {
  return { name: profile?.name ?? '', email: profile?.email ?? '', topic: 'feedback', message: '' }
}

export function validateContactDraft(draft: ContactDraft): ContactDraft {
  const clean = { ...draft, name: draft.name.trim(), email: draft.email.trim(), message: draft.message.trim() }
  if (clean.name.length < 2 || clean.name.length > 80 || /[\r\n]/.test(clean.name)) throw new ContactDraftError('name', 'Enter your name using 2–80 characters.')
  if (!contactRecipient(clean.email)) throw new ContactDraftError('email', 'Enter a valid reply email address.')
  if (!Object.prototype.hasOwnProperty.call(contactTopics, clean.topic)) throw new ContactDraftError('topic', 'Choose the type of note you want to share.')
  if (clean.message.length < 10 || clean.message.length > contactMessageLimit) throw new ContactDraftError('message', 'Write a note using 10–4,000 characters.')
  return clean
}

export function contactSubject(draft: ContactDraft): string {
  return `[Yieldwise] ${contactTopics[draft.topic]}`
}

/** Only user-entered contact details and the note are included; no portfolio data. */
export function formatContactNote(draft: ContactDraft): string {
  const clean = validateContactDraft(draft)
  return `Subject: ${contactSubject(clean)}\nName: ${clean.name}\nReply email: ${clean.email}\n\n${clean.message}`
}

export function buildContactMailto(recipient: string, draft: ContactDraft): string {
  const destination = contactRecipient(recipient)
  if (!destination) throw new Error('The contact email address is not configured.')
  const clean = validateContactDraft(draft)
  const body = `Name: ${clean.name}\nReply email: ${clean.email}\n\n${clean.message}`
  return `mailto:${encodeURIComponent(destination).replace('%40', '@')}?subject=${encodeURIComponent(contactSubject(clean))}&body=${encodeURIComponent(body)}`
}
