import React from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { useRouter } from '../../context/RouterContext';

interface LayoutProps {
  children: React.ReactNode;
  onOpenAuth: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, onOpenAuth }) => {
  const { currentPath } = useRouter();

  const isDriverArea = currentPath.startsWith('/driver');
  const isPassengerArea = currentPath.startsWith('/passenger') || currentPath === '/';

  return (
    <div className="app-layout">
      <Navbar onOpenAuth={onOpenAuth} />

      <div className="app-main-container">
        {isDriverArea && <Sidebar area="driver" />}
        {isPassengerArea && <Sidebar area="passenger" />}

        <main className="main-content-viewport">{children}</main>
      </div>

      <Footer />
    </div>
  );
};
