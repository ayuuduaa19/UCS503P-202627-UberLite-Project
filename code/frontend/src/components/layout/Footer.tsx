import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="footer-container">
        <div className="footer-brand">
          <span className="logo-dot"></span>
          <span>UberLite Distributed Mobility Engine</span>
        </div>
        <div className="footer-meta">
          <span className="status-indicator">
            <span className="pulse-circle"></span> Backend Online
          </span>
          <span className="footer-divider">•</span>
          <span>SE Project (UCS503P)</span>
        </div>
      </div>
    </footer>
  );
};
