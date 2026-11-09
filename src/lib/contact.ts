export const contactTopics = { suggestion: 'Suggestion', problem: 'Problem', compliment: 'Compliment', other: 'Other' } as const
export type ContactTopic = keyof typeof contactTopics
export interface ContactDraft { email: string; topic: ContactTopic; rating: number | null; message: string }
export const contactMessageLimit = 1000

const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
export function contactRecipient(value: string): string | null {
  const email = value.trim()
  return email.length <= 254 && emailPattern.test(email) ? email : null
}

export class ContactDraftError extends Error {
  constructor(public field: keyof ContactDraft, message: string) { super(message); this.name = 'ContactDraftError' }
}

export function newContactDraft(): ContactDraft {
  return { email: '', topic: 'suggestion', rating: null, message: '' }
}

export function validateContactDraft(draft: ContactDraft): ContactDraft {
  const clean = { ...draft, email: draft.email.trim(), message: draft.message.trim() }
  if (clean.email && !contactRecipient(clean.email)) throw new ContactDraftError('email', 'Enter a valid reply email address.')
  if (!Object.prototype.hasOwnProperty.call(contactTopics, clean.topic)) throw new ContactDraftError('topic', 'Choose the type of note you want to share.')
  if (clean.rating !== null && (!Number.isInteger(clean.rating) || clean.rating < 1 || clean.rating > 5)) throw new ContactDraftError('rating', 'Choose a rating from 1 to 5.')
  if (clean.message.length < 10 || clean.message.length > contactMessageLimit) throw new ContactDraftError('message', 'Write a note using 10–1,000 characters.')
  return clean
}

export function contactSubject(draft: ContactDraft): string {
  return `[Yieldwise] ${contactTopics[draft.topic]}`
}

function contactBody(draft: ContactDraft): string {
  const details = []
  if (draft.rating !== null) details.push('Experience rating: ' + draft.rating + '/5')
  if (draft.email) details.push('Reply email: ' + draft.email)
  return [...details, draft.message].join('\n\n')
}

/** Only the feedback and explicitly entered details are included. */
export function formatContactNote(draft: ContactDraft): string {
  const clean = validateContactDraft(draft)
  return 'Subject: ' + contactSubject(clean) + '\n\n' + contactBody(clean)
}

export function buildContactMailto(recipient: string, draft: ContactDraft): string {
  const destination = contactRecipient(recipient)
  if (!destination) throw new Error('The contact email address is not configured.')
  const clean = validateContactDraft(draft)
  const body = contactBody(clean)
  return `mailto:${encodeURIComponent(destination).replace('%40', '@')}?subject=${encodeURIComponent(contactSubject(clean))}&body=${encodeURIComponent(body)}`
}
