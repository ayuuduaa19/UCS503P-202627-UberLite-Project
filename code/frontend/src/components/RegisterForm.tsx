import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { Link } from '../router/RouterContext';
import { useRouter } from '../router/useRouter';
import type { RegisterData, Role, VehicleType } from '../types/auth';
import { getDashboardRouteForRole, validateRegisterForm } from '../utils/auth';

export function RegisterForm() {
  const { register } = useAuth();
  const { navigate } = useRouter();

  const [role, setRole] = useState<Role>('PASSENGER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  // Driver-specific fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('STANDARD');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setServerError(null);
    setErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const formFields = {
      name,
      email,
      password,
      phone,
      role,
      ...(role === 'DRIVER'
        ? {
            licenseNumber,
            vehicleType,
            vehicleModel,
            vehiclePlate,
            vehicleColor,
          }
        : {}),
    };

    const validationErrors = validateRegisterForm(formFields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    let payload: RegisterData;
    if (role === 'DRIVER') {
      payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        role: 'DRIVER',
        licenseNumber: licenseNumber.trim(),
        vehicleType,
        vehicleModel: vehicleModel.trim(),
        vehiclePlate: vehiclePlate.trim(),
        vehicleColor: vehicleColor.trim() || undefined,
      };
    } else {
      payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        role: 'PASSENGER',
      };
    }

    try {
      const user = await register(payload, true);
      if (user) {
        const targetRoute = getDashboardRouteForRole(user.role);
        navigate(targetRoute);
      } else {
        navigate('/login');
      }
    } catch (err: any) {
      setServerError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="auth-header">
          <div className="auth-logo-badge">🚗</div>
          <h2>Create Your Account</h2>
          <p className="auth-subtitle">Join UberLite as a Passenger or Driver</p>
        </div>

        <div className="role-selector-tabs" role="tablist" aria-label="Registration Role Selection">
          <button
            type="button"
            role="tab"
            aria-selected={role === 'PASSENGER'}
            className={`tab-btn ${role === 'PASSENGER' ? 'active' : ''}`}
            onClick={() => handleRoleChange('PASSENGER')}
          >
            👤 Passenger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === 'DRIVER'}
            className={`tab-btn ${role === 'DRIVER' ? 'active' : ''}`}
            onClick={() => handleRoleChange('DRIVER')}
          >
            🚕 Driver
          </button>
        </div>

        {serverError && (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon">⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className={`input-control ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Alex Morgan"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              required
              autoComplete="name"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
              type="email"
              className={`input-control ${errors.email ? 'input-error' : ''}`}
              placeholder="e.g. alex@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              required
              autoComplete="email"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password (min 6 characters)</label>
            <input
              id="reg-password"
              type="password"
              className={`input-control ${errors.password ? 'input-error' : ''}`}
              placeholder="Create a secure password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
              }}
              required
              autoComplete="new-password"
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">Phone Number (Optional)</label>
            <input
              id="reg-phone"
              type="tel"
              className="input-control"
              placeholder="e.g. +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          {/* Driver-specific registration fields */}
          {role === 'DRIVER' && (
            <div className="driver-specific-fields">
              <div className="section-divider">
                <span>Vehicle & License Information</span>
              </div>

              <div className="form-group">
                <label htmlFor="reg-license">Driver License Number</label>
                <input
                  id="reg-license"
                  type="text"
                  className={`input-control ${errors.licenseNumber ? 'input-error' : ''}`}
                  placeholder="e.g. DL-04-2023-1234567"
                  value={licenseNumber}
                  onChange={(e) => {
                    setLicenseNumber(e.target.value);
                    if (errors.licenseNumber) setErrors((prev) => ({ ...prev, licenseNumber: '' }));
                  }}
                  required
                />
                {errors.licenseNumber && (
                  <span className="field-error">{errors.licenseNumber}</span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group form-col">
                  <label htmlFor="reg-vehicle-type">Vehicle Type</label>
                  <select
                    id="reg-vehicle-type"
                    className="input-control"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  >
                    <option value="STANDARD">Standard (Sedan/Hatch)</option>
                    <option value="PREMIUM">Premium (Comfort/Luxury)</option>
                    <option value="XL">XL (SUV/6-seater)</option>
                  </select>
                </div>

                <div className="form-group form-col">
                  <label htmlFor="reg-vehicle-model">Vehicle Model</label>
                  <input
                    id="reg-vehicle-model"
                    type="text"
                    className={`input-control ${errors.vehicleModel ? 'input-error' : ''}`}
                    placeholder="e.g. Toyota Camry"
                    value={vehicleModel}
                    onChange={(e) => {
                      setVehicleModel(e.target.value);
                      if (errors.vehicleModel) setErrors((prev) => ({ ...prev, vehicleModel: '' }));
                    }}
                    required
                  />
                  {errors.vehicleModel && (
                    <span className="field-error">{errors.vehicleModel}</span>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group form-col">
                  <label htmlFor="reg-vehicle-plate">License Plate Number</label>
                  <input
                    id="reg-vehicle-plate"
                    type="text"
                    className={`input-control ${errors.vehiclePlate ? 'input-error' : ''}`}
                    placeholder="e.g. DL 01 AB 1234"
                    value={vehiclePlate}
                    onChange={(e) => {
                      setVehiclePlate(e.target.value);
                      if (errors.vehiclePlate) setErrors((prev) => ({ ...prev, vehiclePlate: '' }));
                    }}
                    required
                  />
                  {errors.vehiclePlate && (
                    <span className="field-error">{errors.vehiclePlate}</span>
                  )}
                </div>

                <div className="form-group form-col">
                  <label htmlFor="reg-vehicle-color">Vehicle Color (Optional)</label>
                  <input
                    id="reg-vehicle-color"
                    type="text"
                    className="input-control"
                    placeholder="e.g. Silver"
                    value={vehicleColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="btn-content-loading">
                <span className="spinner-sm"></span> Creating Account...
              </span>
            ) : (
              `Register as ${role === 'DRIVER' ? 'Driver' : 'Passenger'}`
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Log in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
