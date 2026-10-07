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

export function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <MainAppContent />
      </RouterProvider>
    </AuthProvider>
  );
}

export default App;
