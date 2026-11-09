import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { setStorageScope } from './lib/localStore'
import { setPreferenceScope } from './lib/preferences'
import { closeLocalProfile, createLocalProfile, currentLocalProfile, findLocalProfile, hasBrowserPortfolio, loadProfiles, openLocalProfile, removeLocalProfile, updateLocalProfile, type LocalProfile, type ProfileDetails } from './lib/profiles'
import { LandingPage } from './LandingPage'
import { actionLabels, entryScreen, entryUrl, portfolioUrl, readEntryRoute, type PortfolioAction } from './lib/entryRoutes'
import type { CloudPortfolio } from './lib/cloudPortfolio'

interface ProfileContext {
  profile:LocalProfile|null
  openExisting:()=>void
  startNew:()=>void
  closeProfile:()=>void|Promise<void>
  update:(details:ProfileDetails)=>void|Promise<void>
  remove:()=>void|Promise<void>
  cloud?:CloudPortfolio
  security?:ReactNode
  pendingAction:PortfolioAction|null
  completeEntryAction:()=>void
}
export const AccountContext=createContext<ProfileContext>({profile:null,openExisting:()=>{},startNew:()=>{},closeProfile:()=>{},update:()=>{},remove:()=>{},pendingAction:null,completeEntryAction:()=>{}})
const Context = AccountContext
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
    try{return {profiles:loadProfiles(),profile:currentLocalProfile(),error:''}}
    catch(error){return {profiles:[] as LocalProfile[],profile:null,error:message(error)}}
  })
  const [profile,setProfile]=useState<LocalProfile|null>(boot.profile)
  const [profiles,setProfiles]=useState(boot.profiles)
  const [route,setRoute]=useState(()=>readEntryRoute(typeof window==='undefined'?'':window.location.hash))
  const [pendingAction,setPendingAction]=useState<PortfolioAction|null>(()=>boot.profile&&route.page==='portfolio'&&route.action!=='dashboard'?route.action:null)
  const loginReturn=useRef('#home')
  const changeRoute=useCallback((hash:string,replace=false)=>{
    if(window.location.hash!==hash)window.history[replace?'replaceState':'pushState'](null,'',hash)
    setRoute(readEntryRoute(hash))
    if(hash==='#home')window.scrollTo({top:0,left:0,behavior:'instant'})
  },[])
  const completeEntryAction=useCallback(()=>setPendingAction(null),[])
  useEffect(()=>{
    const sync=()=>setRoute(readEntryRoute(window.location.hash))
    window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync)
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync)}
  },[])
  const screen=entryScreen(route,Boolean(profile))
  useEffect(()=>{
    if(screen!=='landing')return
    const section=window.location.hash.slice(1).split('?')[0]
    if(!section)return
    const frame=requestAnimationFrame(()=>document.getElementById(section)?.scrollIntoView({behavior:'instant',block:'start'}))
    return()=>cancelAnimationFrame(frame)
  },[screen])
  useEffect(()=>{
    if(!profile&&route.page==='portfolio'&&route.action!=='dashboard')changeRoute(entryUrl('signup',route.action),true)
  },[profile,route,changeRoute])
  useEffect(()=>{
    if(screen==='signup'){
      window.scrollTo({top:0,left:0,behavior:'instant'})
      document.getElementById('create-profile-title')?.focus()
    }
  },[screen])
  const closeDialog=useCallback(()=>changeRoute(loginReturn.current,true),[changeRoute])
  function requestAccess(action:PortfolioAction){
    if(profile){setPendingAction(action);changeRoute(portfolioUrl(action))}
    else changeRoute(entryUrl('signup',action))
  }
  function openExisting(){
    loginReturn.current=window.location.hash||'#home'
    changeRoute(entryUrl('login',route.action))
  }
  // Children mount only after their local storage scopes have been selected.
  if(profile){setStorageScope(profile.id);setPreferenceScope(profile.id)}
  function activate(saved:LocalProfile){
    const opened=openLocalProfile(saved.id)
    setStorageScope(opened.id);setPreferenceScope(opened.id)
    setProfile(opened);setProfiles(loadProfiles());setPendingAction(route.action)
    changeRoute(portfolioUrl(route.action),true)
  }
  const context:ProfileContext={
    profile,
    openExisting,
    startNew:()=>changeRoute(entryUrl('signup','dashboard')),
    closeProfile:()=>{closeLocalProfile();setProfile(null);setPendingAction(null);changeRoute('#home',true)},
    update:details=>{if(!profile)return;const updated=updateLocalProfile(profile.id,details);setProfile(updated);setProfiles(loadProfiles())},
    remove:()=>{if(!profile)return;removeLocalProfile(profile.id);setProfile(null);setProfiles(loadProfiles());setPendingAction(null);changeRoute('#home',true)},
    pendingAction,
    completeEntryAction,
  }
  let canKeepBrowser=false,copyWarning=''
  if(screen==='signup'&&profiles.length===0&&!boot.error){
    try{canKeepBrowser=hasBrowserPortfolio()}
    catch{copyWarning='Previous browser records could not be read. They will be kept; a new profile will start empty.'}
  }
  return <Context.Provider value={context}>
    {screen==='portfolio'&&profile?<div key={profile.id}>{children}</div>:screen==='signup'?<CreateProfilePage canCancel={Boolean(profile)} hasProfiles={profiles.length>0} canKeepBrowser={canKeepBrowser} action={route.action} storageError={boot.error} copyWarning={copyWarning} onHome={()=>changeRoute('#home')} onCancel={()=>changeRoute('#profile')} onExisting={openExisting} onCreate={(details,keep)=>activate(createLocalProfile(details,keep))}/>:<LandingPage hasProfile={Boolean(profile)} onStart={requestAccess} onLogin={openExisting}/>}
    {route.page==='login'&&<OpenProfileDialog action={route.action} onClose={closeDialog} onOpen={activate} onCreate={()=>changeRoute(entryUrl('signup',route.action))}/>}
  </Context.Provider>
}

export function CreateProfilePage({canCancel,hasProfiles,canKeepBrowser,onCancel,onExisting,onCreate,onHome,action='dashboard',storageError='',copyWarning=''}:{canCancel:boolean;hasProfiles:boolean;canKeepBrowser:boolean;onCancel:()=>void;onExisting:()=>void;onCreate:(details:ProfileDetails,keep:boolean)=>void;onHome?:()=>void;action?:PortfolioAction;storageError?:string;copyWarning?:string}){
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[keep,setKeep]=useState(canKeepBrowser),[error,setError]=useState(storageError)
  function submit(event:FormEvent){event.preventDefault();setError('');try{if(storageError)throw Error(storageError);onCreate({name,email},canKeepBrowser&&keep)}catch(error){setError(message(error))}}
  return <main className="profile-onboarding">
    <div className="onboarding-header"><a className="brand onboarding-brand" href="#home" onClick={onHome?event=>{event.preventDefault();onHome()}:undefined} aria-label="Yieldwise home"><span className="brand-mark" aria-hidden="true">y</span>yieldwise</a><a href="#home" onClick={onHome?event=>{event.preventDefault();onHome()}:undefined}>← Back to website</a></div>
    <div className="profile-welcome-grid">
      <section className="profile-welcome-copy"><span className="section-kicker">YOUR PORTFOLIO, YOUR SPACE</span><h1>Start with a profile.<br/>Build from here.</h1><p>Give your investments a home on this device. Track your capital, record its changes and see your estimated income in Kenyan shillings.</p><div className="profile-step"><span>01</span><div><strong>Create your profile</strong><p>Your name and email identify your workspace.</p></div></div><div className="profile-step"><span>02</span><div><strong>Add your investments</strong><p>Bring together MMFs, bonds and other income investments.</p></div></div><div className="profile-step"><span>03</span><div><strong>Follow the changes</strong><p>Keep a dated ledger and work toward your income goal.</p></div></div><p className="profile-device-note">Local prototype · no cloud sync · no password protection</p></section>
      <section className="profile-form-card" aria-labelledby="create-profile-title"><div className="profile-card-kicker">WELCOME TO YIELDWISE</div><h2 id="create-profile-title" tabIndex={-1}>Create a new profile</h2><p className="entry-intent">Sign up to {actionLabels[action]}.</p><p>These details are saved only in this browser. Your email is an identifier; no email will be sent.</p>{copyWarning&&<p role="status">{copyWarning}</p>}
        <form onSubmit={submit}><label className="field">Full name<input autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><label className="field">Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          {canKeepBrowser&&<label className="profile-checkbox"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/><span>Keep my existing browser investments and KES settings in this profile. The originals will also remain in browser storage.</span></label>}
          {error&&<p className="validation-error" role="alert">{error}</p>}<button className="button button-primary profile-submit" type="submit">Sign up <span aria-hidden="true">→</span></button>
        </form>
        <div className="profile-form-footer"><p>{hasProfiles?'Already have a profile on this device?':'Returning to a profile saved on this device?'}</p><button className="text-button" onClick={onExisting}>Log in</button>{canCancel&&<button className="text-button" onClick={onCancel}>Back to my profile</button>}</div>
      </section>
    </div>
  </main>
}

export function OpenProfileDialog({onClose,onOpen,onCreate,action='dashboard'}:{onClose:()=>void;onOpen:(profile:LocalProfile)=>void;onCreate:()=>void;action?:PortfolioAction}){
  const ref=useRef<HTMLElement>(null)
  useDialog(ref,onClose)
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[error,setError]=useState('')
  function submit(event:FormEvent){event.preventDefault();setError('');try{onOpen(findLocalProfile({name,email}))}catch(error){setError(message(error))}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section ref={ref} className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="open-profile-title" aria-describedby="open-profile-note"><div className="profile-dialog-header"><span className="section-kicker">WELCOME BACK</span><button className="icon-button" onClick={onClose} aria-label="Close profile popup">×</button></div><h2 id="open-profile-title">Log in to your profile</h2><p className="entry-intent">Continue to {actionLabels[action]}.</p><p id="open-profile-note">Enter the name and email you used on this device. This selects a local workspace; it is not a secure sign-in.</p><form onSubmit={submit}><label className="field">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Email address<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>{error&&<p role="alert" className="validation-error">{error}</p>}<button className="button button-primary profile-submit">Log in <span aria-hidden="true">→</span></button></form><div className="profile-form-footer"><button className="text-button" onClick={onCreate}>Sign up instead</button><button className="text-button" onClick={onClose}>Cancel</button></div></section></div>
}

export function ProfilePage({onBackup}:{onBackup:()=>void}){
  const {profile,openExisting,startNew,closeProfile,update,remove,cloud,security}=useAccount()
  const [name,setName]=useState(profile?.name??''),[email,setEmail]=useState(profile?.email??''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirming,setConfirming]=useState(false),[confirmation,setConfirmation]=useState('')
  if(!profile)return null
  async function save(event:FormEvent){event.preventDefault();setError('');setNotice('');try{await update({name,email});setNotice(cloud?'Profile updated. Check your inbox if you changed your email.':'Profile details saved on this device.')}catch(error){setError(message(error))}}
  async function deleteProfile(event:FormEvent){event.preventDefault();setError('');if(confirmation!==(cloud?'DELETE':'REMOVE'))return;try{await remove()}catch(error){setError(message(error))}}
  const initials=profile.name.split(' ').slice(0,2).map(word=>word[0]).join('').toUpperCase()
  return <section className="profile-page" aria-labelledby="profile-title"><div className="page-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h1 id="profile-title">Profile<span className="heading-period">.</span></h1><p className="subheading">Your details, your portfolio and this device.</p></div><span className="reporting-badge">{cloud?'Cloud account':'Saved in this browser'}</span></div>
    <div className="profile-summary"><span className="profile-avatar" aria-hidden="true">{initials}</span><div><h2>{profile.name}</h2><p>{profile.email}</p><small>Profile created {new Date(profile.createdAt).toLocaleDateString(undefined,{dateStyle:'medium'})}</small></div></div>
    <div className="profile-page-grid"><section className="panel profile-details"><h2>Your details</h2><p>Changing these details keeps your investments, ledger and KES settings.</p><form onSubmit={save}><label className="field">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button button-primary">Save profile details</button></form></section>
    {cloud?<section className="panel profile-privacy"><h2>Cloud portfolio</h2><p>Sign in on another device to access the same investments and settings.</p><button className="button button-quiet" onClick={onBackup}>Manage portfolio backups</button><p><a href="?local=1#dashboard">Open the browser-only workspace to export a backup</a></p></section>:<section className="panel profile-privacy"><h2>On this device</h2><p>Investments and settings belong to this local profile and stay in this browser. They do not sync to another device.</p><p>Local profiles are not password protected. Anyone using this browser can open a saved profile.</p><button className="button button-quiet" onClick={onBackup}>Back up my portfolio</button><div className="profile-workspace-actions"><button className="text-button" onClick={openExisting}>Open another profile</button><button className="text-button" onClick={startNew}>Create another profile</button><button className="text-button" onClick={closeProfile}>Close this profile</button></div></section>}</div>
    {security}
    {error&&<p className="validation-error" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    <section className="profile-remove"><h2>{cloud?'Delete your account':'Remove this local profile'}</h2><p>{cloud?'Permanently deletes your cloud account, investments and settings. Export a backup first. You may need to sign in again to confirm.':'Removes this profile, its investments and its settings from this browser. Export a backup first. Downloaded backups and other profiles are kept.'}</p>{!confirming?<button className="text-button profile-danger" onClick={()=>setConfirming(true)}>Remove profile…</button>:<form onSubmit={deleteProfile}><label className="field">Type {cloud?'DELETE':'REMOVE'} to confirm<input autoComplete="off" required pattern={cloud?'DELETE':'REMOVE'} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><div className="profile-remove-actions"><button className="button danger-button" disabled={confirmation!==(cloud?'DELETE':'REMOVE')}>{cloud?'Delete account':'Remove this profile'}</button><button className="button button-quiet" type="button" onClick={()=>{setConfirming(false);setConfirmation('')}}>Cancel</button></div></form>}</section>
  </section>
}
