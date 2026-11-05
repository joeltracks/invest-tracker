import { readBrowserInvestments } from './localStore'

export interface LocalProfile { id:string; name:string; email:string; createdAt:string }
export interface ProfileDetails {name:string;email:string}
export const profilesKey='yieldwise-local-profiles-v1'
const activeKey='yieldwise-active-local-profile-v1'
const guestPreferences='yieldwise-preferences-demo'
const investmentKey=(id:string)=>`yieldwise-investments-${id}`
const settingsKey=(id:string)=>`yieldwise-preferences-${id}`

export function validateProfileDetails(details:ProfileDetails):ProfileDetails {
  const name=details.name.trim().replace(/\s+/g,' '),email=details.email.trim().toLowerCase()
  if(name.length<2||name.length>80)throw Error('Enter your name using 2–80 characters.')
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address.')
  return {name,email}
}
export function loadProfiles():LocalProfile[] {
  const raw=localStorage.getItem(profilesKey)
  if(!raw)return []
  const value=JSON.parse(raw) as LocalProfile[]
  if(!Array.isArray(value))throw Error('Saved profiles could not be read. Your portfolios have not been changed.')
  const ids=new Set<string>(),emails=new Set<string>()
  for(const profile of value){
    if(!profile||typeof profile.id!=='string'||!/^local-[a-f0-9-]{36}$/.test(profile.id)||typeof profile.name!=='string'||typeof profile.email!=='string'||typeof profile.createdAt!=='string'||!Number.isFinite(Date.parse(profile.createdAt)))throw Error('A saved profile is invalid. Your portfolios have not been changed.')
    const details=validateProfileDetails(profile)
    if(ids.has(profile.id)||emails.has(details.email))throw Error('Saved profiles contain duplicates. Your portfolios have not been changed.')
    ids.add(profile.id);emails.add(details.email)
  }
  return value.map(profile=>({...profile,...validateProfileDetails(profile)}))
}
export function currentLocalProfile():LocalProfile|null {
  const id=sessionStorage.getItem(activeKey)
  return loadProfiles().find(profile=>profile.id===id)??null
}
export function openLocalProfile(id:string):LocalProfile {
  const profile=loadProfiles().find(profile=>profile.id===id)
  if(!profile)throw Error('That profile is no longer saved on this device.')
  sessionStorage.setItem(activeKey,id)
  return profile
}
export function closeLocalProfile(){sessionStorage.removeItem(activeKey)}
export function findLocalProfile(details:ProfileDetails):LocalProfile {
  const normalized=validateProfileDetails(details)
  const profile=loadProfiles().find(item=>item.email===normalized.email&&item.name.toLocaleLowerCase()===normalized.name.toLocaleLowerCase())
  if(!profile)throw Error('These details do not match a profile on this device. Check your name and email, or create a new profile.')
  return profile
}
export function hasBrowserPortfolio():boolean {
  return readBrowserInvestments().length>0||localStorage.getItem(guestPreferences)!==null
}
/** Write the new workspace before publishing its profile. Roll back every owned key on failure. */
export function createLocalProfile(details:ProfileDetails,keepBrowserPortfolio=false):LocalProfile {
  const normalized=validateProfileDetails(details),profiles=loadProfiles()
  if(profiles.some(profile=>profile.email===normalized.email))throw Error('A profile with this email already exists on this device. Open that profile instead.')
  if(keepBrowserPortfolio&&profiles.length>0)throw Error('Existing browser investments can only be copied to the first profile.')
  const profile:LocalProfile={id:`local-${crypto.randomUUID()}`,...normalized,createdAt:new Date().toISOString()}
  const previousProfiles=localStorage.getItem(profilesKey)
  const portfolio=keepBrowserPortfolio?JSON.stringify(readBrowserInvestments()):null
  const preferences=keepBrowserPortfolio?localStorage.getItem(guestPreferences):null
  try {
    localStorage.setItem(investmentKey(profile.id),portfolio??'[]')
    if(preferences)localStorage.setItem(settingsKey(profile.id),preferences)
    localStorage.setItem(profilesKey,JSON.stringify([...profiles,profile]))
  } catch {
    localStorage.removeItem(investmentKey(profile.id));localStorage.removeItem(settingsKey(profile.id))
    if(previousProfiles===null)localStorage.removeItem(profilesKey);else localStorage.setItem(profilesKey,previousProfiles)
    throw Error('The profile could not be saved. Free some browser storage and try again; your existing investments were kept.')
  }
  return profile
}
export function updateLocalProfile(id:string,details:ProfileDetails):LocalProfile {
  const normalized=validateProfileDetails(details),profiles=loadProfiles(),profile=profiles.find(item=>item.id===id)
  if(!profile)throw Error('This profile is no longer saved on this device.')
  if(profiles.some(item=>item.id!==id&&item.email===normalized.email))throw Error('Another profile already uses this email on this device.')
  const updated={...profile,...normalized}
  localStorage.setItem(profilesKey,JSON.stringify(profiles.map(item=>item.id===id?updated:item)))
  return updated
}
/** Local only. Confirmation is collected by the profile page before this operation. */
export function removeLocalProfile(id:string):void {
  const profiles=loadProfiles()
  if(!profiles.some(profile=>profile.id===id))throw Error('This profile is no longer saved on this device.')
  const keys=[profilesKey,investmentKey(id),settingsKey(id)]
  const originals=keys.map(key=>[key,localStorage.getItem(key)] as const)
  try {
    localStorage.removeItem(investmentKey(id));localStorage.removeItem(settingsKey(id))
    localStorage.setItem(profilesKey,JSON.stringify(profiles.filter(profile=>profile.id!==id)))
    if(sessionStorage.getItem(activeKey)===id)closeLocalProfile()
  }catch{
    for(const [key,value] of originals){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}
    throw Error('The profile could not be removed. Your saved data was restored; try again.')
  }
}

