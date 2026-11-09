import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import { AccountProvider } from './Account'
import { CloudAccount } from './CloudAccount'
import { supabase } from './lib/supabase'
import './styles.css'
import './landing.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppErrorBoundary>{supabase && !new URLSearchParams(location.search).has('local')
    ? <CloudAccount client={supabase}><App /></CloudAccount>
    : <AccountProvider><App /></AccountProvider>}</AppErrorBoundary></React.StrictMode>,
)
