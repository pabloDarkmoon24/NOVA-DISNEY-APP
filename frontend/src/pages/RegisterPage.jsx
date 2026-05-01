import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Key, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    clientId: '',
    clientSecret: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await register(
        form.name,
        form.email,
        form.password,
        form.clientId,
        form.clientSecret
      );
      if (response.success) {
        navigate('/dashboard');
      } else {
        setError(response.message || 'Error al crear la cuenta');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <h1 className="auth-title">Crear cuenta</h1>
          <p className="auth-subtitle">Registra tus datos y credenciales Nova</p>
        </div>

        {error && (
          <div className="error-message">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre completo</label>
            <input
              className="form-input"
              type="text"
              name="name"
              placeholder="Juan Pérez"
              value={form.name}
              onChange={handleChange}
              required
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <input
              className="form-input"
              type="email"
              name="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              name="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
            <p className="form-hint">
              Debe tener mínimo 8 caracteres, una mayúscula y un número
            </p>
          </div>

          <div className="form-divider">
            <div className="form-divider-line" />
            <span className="form-divider-text">Credenciales Nova API</span>
            <div className="form-divider-line" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '10px 14px',
              background: 'var(--accent-subtle)',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}
          >
            <Info size={14} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Estas credenciales se guardan cifradas y solo se usan para conectar tu cuenta con la API Nova.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Client ID</label>
            <input
              className="form-input"
              type="text"
              name="clientId"
              placeholder="Tu Client ID de Nova"
              value={form.clientId}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Client Secret</label>
            <input
              className="form-input"
              type="password"
              name="clientSecret"
              placeholder="Tu Client Secret de Nova"
              value={form.clientSecret}
              onChange={handleChange}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <>
                <div className="spinner spinner-sm" />
                Creando cuenta...
              </>
            ) : (
              <>
                <Key size={15} />
                Crear cuenta
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login">Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}