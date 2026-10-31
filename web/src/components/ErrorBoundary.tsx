import { Component, type ReactNode } from 'react'

/** Last line of defence: show a way back instead of a blank page if a screen fails to draw. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  componentDidCatch(error: Error) { console.error('[Portal PIBG]', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pcard" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Halaman ini tidak dapat dipaparkan</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Sila muat semula. Jika anda menggunakan terjemahan automatik pelayar (cth. Google Translate), cuba matikannya untuk laman ini.
        </p>
        <div className="row gap" style={{ justifyContent: 'center' }}>
          <button className="pbtn small" onClick={() => window.location.reload()}>Muat semula</button>
          <a className="pbtn sec small" href="#/">Laman Utama</a>
        </div>
      </div>
    )
  }
}
