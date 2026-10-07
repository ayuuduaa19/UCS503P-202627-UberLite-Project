import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { Link } from '../router/RouterContext';
import { useRouter } from '../router/useRouter';
import type { Role } from '../types/auth';
import { getDashboardRouteForRole, validateLoginForm } from '../utils/auth';

export function LoginForm() {
  const { login } = useAuth();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleMode, setRoleMode] = useState<Role>('PASSENGER');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const validationErrors = validateLoginForm({ email, password });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const user = await login({ email, password });
      const targetRoute = getDashboardRouteForRole(user.role);
      navigate(targetRoute);
    } catch (err: any) {
      setServerError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleTabClick = (role: Role) => {
    setRoleMode(role);
    setServerError(null);
    setErrors({});
  };

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="auth-header">
          <div className="auth-logo-badge">🚗</div>
          <h2>Sign in to UberLite</h2>
          <p className="auth-subtitle">Select your account role and enter your details</p>
        </div>

        <div className="role-selector-tabs" role="tablist" aria-label="Login Role Selection">
          <button
            type="button"
            role="tab"
            aria-selected={roleMode === 'PASSENGER'}
            className={`tab-btn ${roleMode === 'PASSENGER' ? 'active' : ''}`}
            onClick={() => handleRoleTabClick('PASSENGER')}
          >
            👤 Passenger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roleMode === 'DRIVER'}
            className={`tab-btn ${roleMode === 'DRIVER' ? 'active' : ''}`}
            onClick={() => handleRoleTabClick('DRIVER')}
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
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className={`input-control ${errors.email ? 'input-error' : ''}`}
              placeholder={roleMode === 'DRIVER' ? 'driver@example.com' : 'passenger@example.com'}
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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={`input-control ${errors.password ? 'input-error' : ''}`}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
              }}
              required
              autoComplete="current-password"
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="btn-content-loading">
                <span className="spinner-sm"></span> Signing In...
              </span>
            ) : (
              `Sign In as ${roleMode === 'DRIVER' ? 'Driver' : 'Passenger'}`
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Need an account?{' '}
            <Link to="/register" className="auth-link">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
