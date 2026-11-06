import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { setStorageScope } from './lib/localStore'
import { setPreferenceScope } from './lib/preferences'
import { closeLocalProfile, createLocalProfile, currentLocalProfile, findLocalProfile, hasBrowserPortfolio, loadProfiles, openLocalProfile, removeLocalProfile, updateLocalProfile, type LocalProfile, type ProfileDetails } from './lib/profiles'

interface ProfileContext {
  profile:LocalProfile|null
  openExisting:()=>void
  startNew:()=>void
  closeProfile:()=>void
  update:(details:ProfileDetails)=>void
  remove:()=>void
}
const Context=createContext<ProfileContext>({profile:null,openExisting:()=>{},startNew:()=>{},closeProfile:()=>{},update:()=>{},remove:()=>{}})
export const useAccount=()=>useContext(Context)
const message=(error:unknown)=>error instanceof Error?error.message:String(error)

function useDialog(ref:RefObject<HTMLElement>,onClose:()=>void){
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current
    const firstInput=dialog?.querySelector<HTMLElement>('input')??dialog?.querySelector<HTMLElement>('button')
    firstInput?.focus()
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return}
      if(event.key!=='Tab'||!dialog)return
      const controls=[...dialog.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled]),a[href]')],first=controls[0],last=controls.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',keyboard)
    return()=>{document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus()}
  },[ref,onClose])
}

export function AccountProvider({children}:{children:ReactNode}){
  const [boot]=useState(()=>{
    try{const profiles=loadProfiles();return {profiles,profile:currentLocalProfile(),hasGuest:profiles.length===0&&hasBrowserPortfolio(),error:''}}
    catch(error){return {profiles:[] as LocalProfile[],profile:null,hasGuest:false,error:message(error)}}
  })
  const [profile,setProfile]=useState<LocalProfile|null>(boot.profile)
  const [profiles,setProfiles]=useState(boot.profiles)
  const [creating,setCreating]=useState(false)
  const [dialogOpen,setDialogOpen]=useState(!boot.profile&&boot.profiles.length>0)
  const closeDialog=useCallback(()=>setDialogOpen(false),[])
  // Children mount only after their local storage scopes have been selected.
  if(profile){setStorageScope(profile.id);setPreferenceScope(profile.id)}
  function activate(saved:LocalProfile){
    const opened=openLocalProfile(saved.id)
    setStorageScope(opened.id);setPreferenceScope(opened.id)
    setProfile(opened);setProfiles(loadProfiles());setCreating(false);setDialogOpen(false)
  }
  const context:ProfileContext={
    profile,
    openExisting:()=>setDialogOpen(true),
    startNew:()=>{setDialogOpen(false);setCreating(true)},
    closeProfile:()=>{closeLocalProfile();setProfile(null);setCreating(false);setDialogOpen(false)},
    update:details=>{if(!profile)return;const updated=updateLocalProfile(profile.id,details);setProfile(updated);setProfiles(loadProfiles())},
    remove:()=>{if(!profile)return;removeLocalProfile(profile.id);setProfile(null);setProfiles(loadProfiles());setCreating(false);setDialogOpen(false)},
  }
  if(boot.error)return <main className="profile-onboarding"><div className="profile-form-card"><h1>Your profiles need attention</h1><p role="alert">{boot.error}</p><p>Enable browser storage and reload. Existing investment records have not been reset.</p><button className="button button-primary" onClick={()=>location.reload()}>Try again</button></div></main>
  return <Context.Provider value={context}>
    {profile&&!creating?<div key={profile.id}>{children}</div>:<CreateProfilePage canCancel={Boolean(profile)} hasProfiles={profiles.length>0} canKeepBrowser={profiles.length===0&&boot.hasGuest} onCancel={()=>setCreating(false)} onExisting={context.openExisting} onCreate={(details,keep)=>activate(createLocalProfile(details,keep))}/>}
    {dialogOpen&&<OpenProfileDialog onClose={closeDialog} onOpen={activate} onCreate={context.startNew}/>}
  </Context.Provider>
}

export function CreateProfilePage({canCancel,hasProfiles,canKeepBrowser,onCancel,onExisting,onCreate}:{canCancel:boolean;hasProfiles:boolean;canKeepBrowser:boolean;onCancel:()=>void;onExisting:()=>void;onCreate:(details:ProfileDetails,keep:boolean)=>void}){
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[keep,setKeep]=useState(canKeepBrowser),[error,setError]=useState('')
  function submit(event:FormEvent){event.preventDefault();setError('');try{onCreate({name,email},canKeepBrowser&&keep)}catch(error){setError(message(error))}}
  return <main className="profile-onboarding">
    <a className="brand onboarding-brand" href="#profile" aria-label="Yieldwise home"><span className="brand-mark" aria-hidden="true">y</span>yieldwise</a>
    <div className="profile-welcome-grid">
      <section className="profile-welcome-copy"><span className="section-kicker">YOUR PORTFOLIO, YOUR SPACE</span><h1>Start with a profile.<br/>Build from here.</h1><p>Give your investments a home on this device. Track your capital, record its changes and see your estimated income in Kenyan shillings.</p><div className="profile-step"><span>01</span><div><strong>Create your profile</strong><p>Your name and email identify your workspace.</p></div></div><div className="profile-step"><span>02</span><div><strong>Add your investments</strong><p>Bring together MMFs, bonds and other income investments.</p></div></div><div className="profile-step"><span>03</span><div><strong>Follow the changes</strong><p>Keep a dated ledger and work toward your income goal.</p></div></div><p className="profile-device-note">Local prototype · no cloud sync · no password protection</p></section>
      <section className="profile-form-card" aria-labelledby="create-profile-title"><div className="profile-card-kicker">WELCOME TO YIELDWISE</div><h2 id="create-profile-title">Create a new profile</h2><p>These details are saved only in this browser. Your email is an identifier; no email will be sent.</p>
        <form onSubmit={submit}><label className="field">Full name<input autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><label className="field">Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          {canKeepBrowser&&<label className="profile-checkbox"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/><span>Keep my existing browser investments and KES settings in this profile. The originals will also remain in browser storage.</span></label>}
          {error&&<p className="validation-error" role="alert">{error}</p>}<button className="button button-primary profile-submit" type="submit">Sign up <span aria-hidden="true">→</span></button>
        </form>
        <div className="profile-form-footer"><p>{hasProfiles?'Already have a profile on this device?':'Returning to a profile saved on this device?'}</p><button className="text-button" onClick={onExisting}>Log in</button>{canCancel&&<button className="text-button" onClick={onCancel}>Back to my profile</button>}</div>
      </section>
    </div>
  </main>
}

export function OpenProfileDialog({onClose,onOpen,onCreate}:{onClose:()=>void;onOpen:(profile:LocalProfile)=>void;onCreate:()=>void}){
  const ref=useRef<HTMLElement>(null)
  useDialog(ref,onClose)
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[error,setError]=useState('')
  function submit(event:FormEvent){event.preventDefault();setError('');try{onOpen(findLocalProfile({name,email}))}catch(error){setError(message(error))}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section ref={ref} className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="open-profile-title" aria-describedby="open-profile-note"><div className="profile-dialog-header"><span className="section-kicker">WELCOME BACK</span><button className="icon-button" onClick={onClose} aria-label="Close profile popup">×</button></div><h2 id="open-profile-title">Open your profile</h2><p id="open-profile-note">Enter the name and email you used on this device. This selects a local workspace; it is not a secure sign-in.</p><form onSubmit={submit}><label className="field">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Email address<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>{error&&<p role="alert" className="validation-error">{error}</p>}<button className="button button-primary profile-submit">Open profile <span aria-hidden="true">→</span></button></form><div className="profile-form-footer"><button className="text-button" onClick={onCreate}>Create a new profile instead</button><button className="text-button" onClick={onClose}>Cancel</button></div></section></div>
}

export function ProfilePage({onBackup}:{onBackup:()=>void}){
  const {profile,openExisting,startNew,closeProfile,update,remove}=useAccount()
  const [name,setName]=useState(profile?.name??''),[email,setEmail]=useState(profile?.email??''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirming,setConfirming]=useState(false),[confirmation,setConfirmation]=useState('')
  if(!profile)return null
  function save(event:FormEvent){event.preventDefault();setError('');setNotice('');try{update({name,email});setNotice('Profile details saved on this device.')}catch(error){setError(message(error))}}
  function deleteProfile(event:FormEvent){event.preventDefault();setError('');if(confirmation!=='REMOVE')return;try{remove()}catch(error){setError(message(error))}}
  const initials=profile.name.split(' ').slice(0,2).map(word=>word[0]).join('').toUpperCase()
  return <section className="profile-page" aria-labelledby="profile-title"><div className="page-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h1 id="profile-title">Profile<span className="heading-period">.</span></h1><p className="subheading">Your details, your portfolio and this device.</p></div><span className="reporting-badge">Saved in this browser</span></div>
    <div className="profile-summary"><span className="profile-avatar" aria-hidden="true">{initials}</span><div><h2>{profile.name}</h2><p>{profile.email}</p><small>Profile created {new Date(profile.createdAt).toLocaleDateString(undefined,{dateStyle:'medium'})}</small></div></div>
    <div className="profile-page-grid"><section className="panel profile-details"><h2>Your details</h2><p>Changing these details keeps your investments, ledger and KES settings.</p><form onSubmit={save}><label className="field">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button button-primary">Save profile details</button></form></section>
    <section className="panel profile-privacy"><h2>On this device</h2><p>Investments and settings belong to this local profile and stay in this browser. They do not sync to another device.</p><p>Local profiles are not password protected. Anyone using this browser can open a saved profile.</p><button className="button button-quiet" onClick={onBackup}>Back up my portfolio</button><div className="profile-workspace-actions"><button className="text-button" onClick={openExisting}>Open another profile</button><button className="text-button" onClick={startNew}>Create another profile</button><button className="text-button" onClick={closeProfile}>Close this profile</button></div></section></div>
    {error&&<p className="validation-error" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    <section className="profile-remove"><h2>Remove this local profile</h2><p>Removes this profile, its investments and its settings from this browser. Export a backup first. Downloaded backups and other profiles are kept.</p>{!confirming?<button className="text-button profile-danger" onClick={()=>setConfirming(true)}>Remove profile…</button>:<form onSubmit={deleteProfile}><label className="field">Type REMOVE to confirm<input autoComplete="off" required pattern="REMOVE" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><div className="profile-remove-actions"><button className="button danger-button" disabled={confirmation!=='REMOVE'}>Remove this profile</button><button className="button button-quiet" type="button" onClick={()=>{setConfirming(false);setConfirmation('')}}>Cancel</button></div></form>}</section>
  </section>
}
