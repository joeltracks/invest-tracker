import type { SupabaseClient } from '@supabase/supabase-js'
import type { Investment, InvestmentEvent, InvestmentInput } from '../types'
import type { Preferences } from './preferences'

export interface PortfolioSnapshot {
  items: Investment[]
  preferences: Preferences
  version: number
}

export type PortfolioCommand =
  | { action: 'create' | 'edit'; id: string; investment: InvestmentInput & { id: string }; exchangeRate?: number }
  | { action: 'delete' | 'restore' | 'close'; id: string }
  | { action: 'reconcile'; id: string; value: number }
  | { action: 'event'; id: string; event: InvestmentEvent }
  | { action: 'preferences'; preferences: Preferences }
  | { action: 'import'; items: Investment[]; preferences?: Preferences }

export interface CloudPortfolio {
  read(): Promise<PortfolioSnapshot>
  write(version: number, command: PortfolioCommand): Promise<PortfolioSnapshot>
}

export function createCloudPortfolio(client: SupabaseClient, userId: string): CloudPortfolio {
  async function requireSession() {
    const { data, error } = await client.auth.getSession()
    if (error || data.session?.user.id !== userId) throw Error('Sign in again to access your cloud portfolio.')
  }
  return {
    async read() {
      await requireSession()
      const { data, error } = await client.rpc('yieldwise_portfolio', { expected_user: userId })
      if (error || !data) throw Error('Could not load your cloud portfolio. Check your session and try again.')
      return data as PortfolioSnapshot
    },
    async write(version, { action, ...payload }) {
      await requireSession()
      const { data, error } = await client.rpc('yieldwise_write', { expected_user: userId, expected_version: version, action, payload })
      if (error) {
        if (error.code === 'PT429') throw Error('Too many portfolio changes. Wait a minute and retry.')
        if (error.code === '40001') throw Error('Portfolio changed on another device. Reload before trying again.')
        if (error.code === 'P0001') throw Error(error.message)
        if (error.code === '23505') throw Error('This record already exists. Reload before retrying.')
        if (error.code?.startsWith('22') || error.code === '23514' || error.code === '23502') throw Error('A portfolio value is outside the supported range. Check your entries.')
        throw Error('Could not save to the cloud. Reload the portfolio before retrying.')
      }
      if (!data) throw Error('Could not confirm the save. Reload the portfolio before retrying.')
      return data as PortfolioSnapshot
    },
  }
}
