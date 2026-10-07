import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { VehicleType } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register, setDemoUser } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('STANDARD');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (tab === 'login') {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          name,
          phone: phone || undefined,
          role,
          licenseNumber: role === 'DRIVER' ? licenseNumber : undefined,
          vehicleType: role === 'DRIVER' ? vehicleType : undefined,
          vehicleModel: role === 'DRIVER' ? vehicleModel : undefined,
          vehiclePlate: role === 'DRIVER' ? vehiclePlate : undefined,
          vehicleColor: role === 'DRIVER' ? vehicleColor : undefined,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = (demoRole: 'PASSENGER' | 'DRIVER') => {
    setDemoUser(demoRole);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card auth-modal-card">
        <div className="modal-header">
          <h3>{tab === 'login' ? 'Sign In to UberLite' : 'Create UberLite Account'}</h3>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="auth-tab-buttons">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => setTab('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => setTab('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body auth-form-body">
          {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

          {tab === 'register' && (
            <div className="role-toggle-group">
              <label className="section-label">Register As</label>
              <div className="role-buttons">
                <button
                  type="button"
                  className={`btn-role ${role === 'PASSENGER' ? 'active' : ''}`}
                  onClick={() => setRole('PASSENGER')}
                >
                  👤 Passenger
                </button>
                <button
                  type="button"
                  className={`btn-role ${role === 'DRIVER' ? 'active' : ''}`}
                  onClick={() => setRole('DRIVER')}
                >
                  🚗 Driver
                </button>
              </div>
            </div>
          )}

          {tab === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="Anshika Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="user@uberlite.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {tab === 'register' && (
            <div className="form-group">
              <label>Phone Number (Optional)</label>
              <input
                type="tel"
                className="form-control"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}

          {tab === 'register' && role === 'DRIVER' && (
            <div className="driver-register-extra">
              <div className="divider-label">Vehicle & License Information</div>

              <div className="form-group">
                <label>Driving License Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="DL-04-2026-1234567"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Vehicle Type</label>
                <select
                  className="form-control"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                >
                  <option value="STANDARD">Standard Sedan / Hatchback</option>
                  <option value="PREMIUM">Premium Luxury Sedan</option>
                  <option value="XL">Uber XL (SUV / 6 Seater)</option>
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Vehicle Model</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Honda City"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Plate Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="DL-01-AB-1234"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Vehicle Color (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Pearl White"
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="modal-footer mt-4">
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={isLoading}>
              {isLoading
                ? 'Processing...'
                : tab === 'login'
                ? 'Sign In to Account'
                : 'Create Account & Continue'}
            </button>
          </div>
        </form>

        <div className="quick-demo-footer">
          <span className="text-xs text-muted">Or log in instantly using preset accounts:</span>
          <div className="demo-preset-row">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickDemo('PASSENGER')}
            >
              👤 Alice (Passenger)
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickDemo('DRIVER')}
            >
              🚗 Bob (Driver)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
