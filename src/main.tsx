import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, maxWidth: 680, margin: '40px auto', fontFamily: 'sans-serif', background: '#fff', color: '#111827', borderRadius: 14, border: '1px solid #cbd5e1' }}>
          <h2 style={{ marginTop: 0 }}>Display Error Recovered</h2>
          <p style={{ lineHeight: 1.6 }}>A panel failed to render cleanly ({this.state.message}). Click below to recover without losing the page.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{ padding: '10px 16px', borderRadius: 8, border: 0, background: '#102d2b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Reload Interface
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
