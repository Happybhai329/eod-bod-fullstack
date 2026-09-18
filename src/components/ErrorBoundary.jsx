import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div style={{
          padding: '24px',
          margin: '20px auto',
          maxWidth: '540px',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #fecaca',
          boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.1)',
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#fee2e2',
            color: '#dc2626',
            fontSize: '1.4rem',
            marginBottom: '12px'
          }}>
            ⚠️
          </div>
          <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.2rem', fontWeight: 800 }}>
            {this.props.title || 'Something went wrong'}
          </h3>
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.88rem' }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this section.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#475569',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
