// Public recipient address only. No email-provider credentials belong in client code.
export const contactEmail = (import.meta.env?.VITE_CONTACT_EMAIL ?? '').trim()
