import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { AccountContext } from './Account'
import { LandingPage } from './LandingPage'
import { actionLabels, entryUrl, portfolioUrl, readEntryRoute, type PortfolioAction } from './lib/entryRoutes'
import { createCloudPortfolio } from './lib/cloudPortfolio'

function redirectUrl(recovery = false) {
  const url = new URL(window.location.pathname, window.location.origin)
  if (recovery) url.searchParams.set('recovery', '1')
  return url.toString()
}

function errorMessage(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (status === 429) return 'Too many requests. Wait a moment and try again.'
  if (code === 'invalid_credentials') return 'Check your email address and password.'
  if (code === 'email_not_confirmed') return 'Verify your email address before signing in.'
  if (code === 'weak_password' || code === 'same_password') return 'Choose a stronger password you have not used for this account.'
  if (code === 'otp_expired') return 'That link or code has expired. Request a new one and try again.'
  if (code === 'mfa_verification_failed') return 'Check the code in your authenticator and try again.'
  return 'The account request failed. Please try again.'
}

export function CloudAccount({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [route, setRoute] = useState(() => readEntryRoute(location.hash))
  const [pendingAction, setPendingAction] = useState<PortfolioAction | null>(() => route.action)
  const [recovery, setRecovery] = useState(() => new URLSearchParams(location.search).has('recovery'))
  const [assurance, setAssurance] = useState<{ userId: string; challenge: boolean } | null>(null)
  const [sessionError, setSessionError] = useState('')
  const user = session?.user
  const userId = user?.id
  const cloud = useMemo(() => userId ? createCloudPortfolio(client, userId) : undefined, [client, userId])

  useEffect(() => {
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (!next) { setAssurance(null); setSessionError('') }
      setSession(next)
      setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [client])

  const accessToken = session?.access_token
  useEffect(() => {
    if (!accessToken || !userId) return
    let active = true
    void client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken).then(({ data, error }) => {
      if (!active) return
      setSessionError(error ? 'Could not verify your session. Sign out and try again.' : '')
      if (!error) setAssurance({ userId, challenge: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' })
    })
    return () => { active = false }
  }, [client, accessToken, userId])

  useEffect(() => {
    const sync = () => setRoute(readEntryRoute(location.hash))
    addEventListener('hashchange', sync)
    addEventListener('popstate', sync)
    return () => { removeEventListener('hashchange', sync); removeEventListener('popstate', sync) }
  }, [])

  function go(hash: string, replace = false) {
    if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash)
    setRoute(readEntryRoute(hash))
  }

  function enter(action: PortfolioAction) {
    setPendingAction(action)
    go(portfolioUrl(action), true)
  }

  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
    setSession(null)
    setPendingAction(null)
    go('#home', true)
  }

  const profile = user ? {
    id: user.id,
    name: typeof user.user_metadata.display_name === 'string' && user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name : 'Yieldwise member',
    email: user.email ?? '',
    createdAt: user.created_at,
  } : null

  if (!ready || (userId && assurance?.userId !== userId && !sessionError)) {
    return <main className="dashboard"><p role="status">Checking your session…</p></main>
  }
  if (sessionError) return <main className="dashboard"><p role="alert">{sessionError}</p><button type="button" className="button" onClick={() => void signOut().catch(error => setSessionError(errorMessage(error)))}>Sign out</button></main>
  if (assurance?.challenge) return <AuthForm key="challenge" client={client} mode="challenge" action={route.action} onBack={signOut} onSwitch={() => {}} onSuccess={() => { if (!recovery) enter(route.action) }} />
  if (recovery && session) return <AuthForm key="recovery" client={client} mode="recovery" action={route.action} onBack={async () => { history.replaceState(null, '', redirectUrl() + '#home'); setRecovery(false); await signOut() }} onSwitch={() => {}} onSuccess={() => {
    history.replaceState(null, '', redirectUrl() + '#dashboard')
    setRecovery(false)
    enter('dashboard')
  }} />

  if (profile && cloud && route.page === 'portfolio') {
    return <AccountContext.Provider value={{
      profile, cloud,
      openExisting: () => void signOut().catch(error => setSessionError(errorMessage(error))),
      startNew: () => go('#signup'),
      closeProfile: () => signOut().catch(error => setSessionError(errorMessage(error))),
      update: async details => {
        const { error } = await client.auth.updateUser({
          data: { display_name: details.name.trim() },
          ...(details.email.trim() !== profile.email ? { email: details.email.trim() } : {}),
        }, { emailRedirectTo: redirectUrl() })
        if (error) throw error
      },
      remove: async () => {
        const { error } = await client.functions.invoke('delete-account', { body: { confirmation: 'DELETE', accountId: profile.id } })
        if (error) {
          let detail = 'Could not delete this account. Sign in again and retry.'
          if ('context' in error && error.context instanceof Response) {
            const response = await error.context.json().catch(() => null)
            if (typeof response?.error === 'string') detail = response.error
          }
          throw Error(detail)
        }
        await client.auth.signOut({ scope: 'local' })
        setSession(null)
        go('#home', true)
      },
      security: <CloudSecurity client={client} />,
      pendingAction,
      completeEntryAction: () => setPendingAction(null),
    }}><div key={profile.id}>{children}</div></AccountContext.Provider>
  }

  if (route.page === 'signup' || route.page === 'login' || (route.page === 'portfolio' && route.action !== 'dashboard')) {
    const mode = route.page === 'login' ? 'login' : 'signup'
    return <AuthForm key={mode} client={client} mode={mode} action={route.action}
      onBack={() => go('#home')} onSwitch={() => go(entryUrl(mode === 'login' ? 'signup' : 'login', route.action))}
      onSuccess={() => enter(route.action)} />
  }

  return <LandingPage cloud hasProfile={Boolean(user)} onStart={action => user ? enter(action) : go(entryUrl('signup', action))}
    onLogin={() => user ? enter('dashboard') : go('#login')} />
}

function AuthForm({ client, mode, action, onBack, onSwitch, onSuccess }: {
  client: SupabaseClient
  mode: 'login' | 'signup' | 'recovery' | 'challenge'
  action: PortfolioAction
  onBack: () => void | Promise<void>
  onSwitch: () => void
  onSuccess: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (mode === 'signup') {
        if (name.trim().length < 2) { setError('Enter your name.'); return }
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: {
          data: { display_name: name.trim() }, emailRedirectTo: redirectUrl(),
        } })
        if (error) throw error
        if (data.session) onSuccess()
        else setNotice('Check your email to verify the account, then sign in.')
      } else if (mode === 'login') {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onSuccess()
      } else if (mode === 'recovery') {
        const { error } = await client.auth.updateUser({ password })
        if (error) throw error
        onSuccess()
      } else {
        const { data, error } = await client.auth.mfa.listFactors()
        if (error) throw error
        const factor = data.totp[0]
        if (!factor) { setError('No authenticator is available for this account.'); return }
        const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
        if (result.error) throw result.error
        onSuccess()
      }
    })
  }

  const title = { signup: 'Create an account', login: 'Sign in', recovery: 'Set a new password', challenge: 'Verify your authenticator' }[mode]
  const credentials = mode === 'signup' || mode === 'login'
  return <main className="profile-onboarding">
    <section className="profile-form-card" aria-labelledby="cloud-auth-title">
      <div className="profile-card-kicker">YIELDWISE</div>
      <h1 id="cloud-auth-title">{title}</h1>
      {credentials && <p>Continue to {actionLabels[action]}.</p>}
      <form onSubmit={submit}>
        {mode === 'signup' && <label className="field">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>}
        {credentials && <label className="field">Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {mode === 'challenge' ? <label className="field">Six-digit code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
          : <label className="field">Password<input type="password" required minLength={mode === 'login' ? undefined : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
        {error && <p role="alert" className="validation-error">{error}</p>}
        {notice && <p role="status" className="success-message">{notice}</p>}
        <button className="button button-primary profile-submit" disabled={busy}>{busy ? 'Working…' : title}</button>
      </form>
      <div className="profile-form-footer">
        {credentials && <button className="text-button" onClick={onSwitch}>{mode === 'login' ? 'Create an account' : 'Sign in instead'}</button>}
        {mode === 'login' && <button className="text-button" disabled={busy} onClick={() => void run(async () => {
          if (!email.trim()) { setError('Enter your email address first.'); return }
          const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl(true) })
          if (error) throw error
          setNotice('If an account exists for this address, check your inbox for a reset link.')
        })}>Reset password</button>}
        <button className="text-button" onClick={() => void run(async () => { await onBack() })}>{credentials ? 'Back to website' : 'Cancel and sign out'}</button>
        {credentials && <p><a href="?local=1#dashboard">Open the browser-only workspace</a> to export existing investments before importing them here.</p>}
      </div>
    </section>
  </main>
}

function CloudSecurity({ client }: { client: SupabaseClient }) {
  const [enrollment, setEnrollment] = useState<{ id: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <section className="panel profile-details">
    <h2>Authenticator security</h2>
    <p>Add an authenticator app to protect future sign-ins.</p>
    {!enrollment ? <button className="button button-quiet" disabled={busy} onClick={() => void run(async () => {
      const { data, error } = await client.auth.mfa.listFactors()
      if (error) throw error
      if (data.totp.length) { setNotice('Your account already has a verified authenticator.'); return }
      for (const factor of data.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')) {
        const stale = await client.auth.mfa.unenroll({ factorId: factor.id })
        if (stale.error) throw stale.error
      }
      const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Yieldwise authenticator' })
      if (result.error) throw result.error
      setEnrollment({ id: result.data.id, secret: result.data.totp.secret })
    })}>Set up authenticator</button> : <form onSubmit={event => {
      event.preventDefault()
      void run(async () => {
        const result = await client.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code })
        if (result.error) throw result.error
        setEnrollment(null); setCode(''); setNotice('Authenticator verified.')
      })
    }}>
      <p>Enter this setup key in your authenticator app.</p><p><code>{enrollment.secret}</code></p>
      <label className="field">Six-digit code<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>
      <button className="button button-primary" disabled={busy}>Verify authenticator</button>
      <button className="button button-quiet" type="button" disabled={busy} onClick={() => void run(async () => {
        const { error } = await client.auth.mfa.unenroll({ factorId: enrollment.id })
        if (error) throw error
        setEnrollment(null); setCode('')
      })}>Cancel setup</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="validation-error">{error}</p>}
  </section>
}
