import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.jsx';
import './index.css';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <section
          style={{
            width: '100%',
            maxWidth: '640px',
            padding: '28px',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            background: '#ffffff',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>
            화면을 불러오는 중 오류가 발생했습니다.
          </h1>
          <p style={{ margin: '12px 0 0', lineHeight: 1.7, color: '#475569' }}>
            브라우저를 새로고침해 주세요. 같은 문제가 반복되면 관리자에게
            브라우저 개발자 도구의 오류 내용을 전달해 주세요.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 16px',
              border: 0,
              borderRadius: '10px',
              background: '#e65300',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </section>
      </main>
    );
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React root element (#root) was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
