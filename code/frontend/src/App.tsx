import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { RouterProvider, useRouter } from './context/RouterContext';
import { Layout } from './components/layout/Layout';
import { PassengerArea } from './components/passenger/PassengerArea';
import { DriverArea } from './components/driver/DriverArea';
import { AuthModal } from './components/auth/AuthModal';
import './App.css';

const MainAppContent: React.FC = () => {
  const { currentPath } = useRouter();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const isDriverArea = currentPath.startsWith('/driver');

  return (
    <Layout onOpenAuth={() => setIsAuthOpen(true)}>
      {isDriverArea ? (
        <DriverArea onOpenAuth={() => setIsAuthOpen(true)} />
      ) : (
        <PassengerArea onOpenAuth={() => setIsAuthOpen(true)} />
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </Layout>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UberLite UI Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto', background: '#1e293b', borderRadius: '12px', color: '#f8fafc' }}>
          <h2>⚠️ Something went wrong</h2>
          <p style={{ color: '#94a3b8', margin: '1rem 0' }}>{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{ padding: '0.6rem 1.2rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload UberLite
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider>
          <MainAppContent />
        </RouterProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
