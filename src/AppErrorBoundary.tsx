import { Component, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="dashboard">
        <h1>Yieldwise couldn’t load this page</h1>
        <p role="alert">Reload to reconnect. Check your portfolio before retrying an interrupted save.</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          Reload Yieldwise
        </button>
      </main>
    )
  }
}
