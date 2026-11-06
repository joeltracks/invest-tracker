/** Only known portfolio actions may be resumed after local sign up / log in. */
export const portfolioActions = ['dashboard', 'add-investment', 'import-statement', 'income-goal', 'investments', 'profile', 'contact'] as const
export type PortfolioAction = typeof portfolioActions[number]
export interface EntryRoute { page: 'landing' | 'signup' | 'login' | 'portfolio'; action: PortfolioAction }

export function readEntryRoute(hash: string): EntryRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  if (path === 'signup' || path === 'login') {
    const requested = new URLSearchParams(query).get('next')
    const action = portfolioActions.find(action => action === requested) ?? 'dashboard'
    return { page: path, action }
  }
  if (['home', 'public-content', 'features', 'how-it-works', 'estimates', 'privacy'].includes(path)) return { page: 'landing', action: 'dashboard' }
  const action = path === 'profile' ? 'profile' : path === 'contact' ? 'contact' : path === 'investments' ? 'investments' : path === 'portfolio-settings' ? 'income-goal' : 'dashboard'
  return { page: 'portfolio', action }
}

export function entryScreen(route: EntryRoute, hasProfile: boolean): 'landing' | 'signup' | 'portfolio' {
  if (route.page === 'signup') return 'signup'
  if (route.page === 'landing') return 'landing'
  if (hasProfile) return 'portfolio'
  if (route.page === 'portfolio' && route.action !== 'dashboard') return 'signup'
  return 'landing'
}

export function entryUrl(page: 'signup' | 'login', action: PortfolioAction): string {
  return `#${page}${action === 'dashboard' ? '' : `?next=${action}`}`
}

export function portfolioUrl(action: PortfolioAction): string {
  return action === 'profile' ? '#profile' : action === 'contact' ? '#contact' : action === 'income-goal' ? '#portfolio-settings' : action === 'investments' ? '#investments' : '#dashboard'
}

export const actionLabels: Record<PortfolioAction, string> = {
  dashboard: 'open your portfolio',
  'add-investment': 'add an investment',
  'import-statement': 'import a statement',
  'income-goal': 'set an income goal',
  investments: 'manage your investments',
  profile: 'open your profile',
  contact: 'contact us or share feedback',
}
