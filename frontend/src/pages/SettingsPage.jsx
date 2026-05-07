import { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';
import novaService from '../services/novaService';

export default function SettingsPage() {
  const { user } = useAuth();
  const { toasts, toast, removeToast } = useToast();

  const [clientId, setClientId]       = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');
  const [saved, setSaved]             = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaved(false);

    if (!clientId.trim())     { setFormError('El Client ID es requerido'); return; }
    if (!clientSecret.trim()) { setFormError('El Client Secret es requerido'); return; }

    setSaving(true);
    try {
      const res = await novaService.updateCredentials(clientId.trim(), clientSecret.trim());
      if (res.success) {
        setSaved(true);
        setClientId('');
        setClientSecret('');
        toast.success('Credenciales verificadas y guardadas');
      } else {
        setFormError(res.message || 'Error al actualizar');
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Error al actualizar las credenciales');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content" style={{ maxWidth: 680 }}>

        <div className="page-header">
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Gestiona tu cuenta y credenciales de Nova API</p>
        </div>

        {/* Perfil */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, color: '#020617', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, letterSpacing: '-0.01em' }}>
                {user?.name}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.email}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Nombre', value: user?.name },
              { label: 'Correo', value: user?.email },
            ].map((f) => (
              <div
                key={f.label}
                style={{
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p style={{
                  fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4,
                }}>
                  {f.label}
                </p>
                <p style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {f.value || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Credenciales Nova */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 'var(--radius-sm)',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-secondary)',
              flexShrink: 0,
            }}>
              <KeyRound size={16} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, letterSpacing: '-0.01em' }}>
                Credenciales Nova API
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Se verifican con Nova antes de guardar
              </p>
            </div>
          </div>

          <div style={{
            padding: '10px 14px', marginBottom: 18,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13, color: 'var(--color-warning)', lineHeight: 1.55,
          }}>
            <AlertCircle size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-top' }} />
            Reemplaza las credenciales actuales. El historial de transacciones no se borra.
          </div>

          {saved && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', marginBottom: 16,
              background: 'rgba(34,197,94,0.07)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-success)', fontSize: 13, fontWeight: 500,
            }}>
              <CheckCircle size={15} />
              Credenciales actualizadas y verificadas exitosamente
            </div>
          )}

          {formError && (
            <div className="error-message">
              <AlertCircle size={14} />
              {formError}
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Nuevo Client ID</label>
              <input
                className="form-input"
                type="text"
                placeholder="Tu Client ID de Nova"
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setFormError(''); setSaved(false); }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nuevo Client Secret</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Tu Client Secret de Nova"
                  value={clientSecret}
                  onChange={(e) => { setClientSecret(e.target.value); setFormError(''); setSaved(false); }}
                  autoComplete="new-password"
                  spellCheck={false}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  aria-label={showSecret ? 'Ocultar secret' : 'Mostrar secret'}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)',
                    display: 'flex', padding: 4,
                    transition: 'color var(--transition-fast)',
                  }}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
            >
              {saving ? (
                <><div className="spinner spinner-sm" />Verificando con Nova...</>
              ) : (
                <><Shield size={14} />Verificar y guardar</>
              )}
            </button>
          </form>
        </div>

      </main>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
