import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle, RefreshCw, Play, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import novaService from '../services/novaService';

const QUANTITIES = [5, 10, 20, 30, 50];
const STEPS = { SETUP: 1, EXECUTING: 2, RESULTS: 3 };

export default function QuickBuyPage() {
  const { toasts, toast, removeToast } = useToast();
  const isExecutingRef = useRef(false);

  const [products, setProducts]     = useState([]);
  const [balance, setBalance]       = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  const [step, setStep]             = useState(STEPS.SETUP);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail]           = useState('');
  const [quantity, setQuantity]     = useState(10);
  const [formError, setFormError]   = useState('');
  const [results, setResults]       = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, balRes] = await Promise.all([
          novaService.getProducts(),
          novaService.getBalance(),
        ]);
        if (prodRes.success) setProducts(prodRes.data.products);
        if (balRes.success)  setBalance(balRes.data);
      } catch {
        toast.error('Error al cargar datos');
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  const totalCost  = selectedProduct ? selectedProduct.price * quantity : 0;
  const hasBalance = balance ? balance.balance >= totalCost : false;

  const validate = () => {
    if (!selectedProduct)                          { setFormError('Selecciona un producto'); return false; }
    if (!customerName.trim())                      { setFormError('El nombre es requerido'); return false; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim()))  { setFormError('El correo no es válido'); return false; }
    if (!hasBalance)                               { setFormError('Saldo insuficiente'); return false; }
    return true;
  };

  const handleExecute = async () => {
    setFormError('');
    if (!validate() || isExecutingRef.current) return;

    isExecutingRef.current = true;
    setStep(STEPS.EXECUTING);

    try {
      const response = await novaService.quickBuy(
        selectedProduct.id,
        customerName.trim(),
        email.trim().toLowerCase(),
        quantity
      );

      if (response.success) {
        setResults(response.data);
        setStep(STEPS.RESULTS);
        const balRes = await novaService.getBalance();
        if (balRes.success) setBalance(balRes.data);
        toast.success(`${response.data.successCount} de ${quantity} compras exitosas`);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Error de conexión';
      setResults({ results: [], successCount: 0, failCount: quantity, networkError: msg, customerName, email });
      setStep(STEPS.RESULTS);
      toast.error(`Error: ${msg}. Revisa el historial antes de reintentar.`);
    } finally {
      isExecutingRef.current = false;
    }
  };

  const handleReset = () => {
    setStep(STEPS.SETUP);
    setResults(null);
    setFormError('');
    isExecutingRef.current = false;
  };

  const formatPrice = (p) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(p);

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">

        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Masivo Rápido</h1>
            <p className="page-subtitle">Compra múltiples unidades del mismo producto para un cliente</p>
          </div>
          {balance && (
            <div className="stat-card" style={{ padding: '12px 18px', marginBottom: 0, cursor: 'default' }}>
              <div className="stat-icon blue"><Zap size={16} /></div>
              <div>
                <p className="stat-label">Saldo</p>
                <p className="stat-value" style={{ fontSize: 16 }}>{formatPrice(balance.balance)}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── STEP 1: SETUP ── */}
        {step === STEPS.SETUP && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Selector de producto */}
            <div className="card">
              <p className="section-title">1. Selecciona el producto</p>
              {loadingData ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <div className="spinner" />
                </div>
              ) : (
                <div className="products-grid">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="product-card"
                      onClick={() => { setSelectedProduct(p); setFormError(''); }}
                      style={{
                        borderColor: selectedProduct?.id === p.id ? 'rgba(34,197,94,0.45)' : undefined,
                        boxShadow:   selectedProduct?.id === p.id ? 'var(--glow-primary)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <p className="product-name">{p.name}</p>
                        {selectedProduct?.id === p.id && (
                          <CheckCircle size={15} style={{ color: 'var(--color-primary)', flexShrink: 0, marginLeft: 8 }} />
                        )}
                      </div>
                      {p.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.description}</p>
                      )}
                      <p className="product-price">{formatPrice(p.price)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Formulario de cliente y cantidad */}
            {selectedProduct && (
              <div className="card">
                <p className="section-title">2. Datos del cliente y cantidad</p>

                {/* Campos nombre y correo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Nombre del cliente</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Nombre completo"
                      value={customerName}
                      onChange={(e) => { setCustomerName(e.target.value); setFormError(''); }}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Correo del cliente</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="correo@cliente.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFormError(''); }}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Botones de cantidad */}
                <div style={{ marginBottom: 20 }}>
                  <label className="form-label">Cantidad de compras</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {QUANTITIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuantity(q)}
                        style={{
                          padding: '9px 22px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${quantity === q ? 'rgba(34,197,94,0.5)' : 'var(--border)'}`,
                          background: quantity === q ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                          color: quantity === q ? 'var(--color-primary)' : 'var(--text-secondary)',
                          fontFamily: 'inherit',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        ×{q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview costo */}
                <div style={{
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {quantity} × {formatPrice(selectedProduct.price)} — <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.name}</strong>
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                      {formatPrice(totalCost)}
                    </p>
                    {!hasBalance && balance && (
                      <p style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 2 }}>
                        Disponible: {formatPrice(balance.balance)}
                      </p>
                    )}
                  </div>
                </div>

                {formError && (
                  <div className="error-message" style={{ marginBottom: 16 }}>
                    <AlertCircle size={14} />
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '11px 28px' }}
                    onClick={handleExecute}
                    disabled={!hasBalance || !selectedProduct}
                  >
                    <Play size={14} />
                    Ejecutar {quantity} compras
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: EXECUTING ── */}
        {step === STEPS.EXECUTING && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.01em' }}>
              Procesando {quantity} compras...
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {customerName} — {email}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              No cierres esta ventana
            </p>
          </div>
        )}

        {/* ── STEP 3: RESULTS ── */}
        {step === STEPS.RESULTS && results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {results.networkError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '14px 16px',
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-warning)',
                fontSize: 13, lineHeight: 1.6,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Error de conexión durante la ejecución.</strong>{' '}
                  Algunas compras pudieron procesarse en el servidor.{' '}
                  <a href="/history" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                    Revisa el historial
                  </a>{' '}
                  antes de reintentar.
                  <br />
                  <span style={{ opacity: 0.7, fontSize: 11 }}>{results.networkError}</span>
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'Exitosas',     value: results.successCount,                           color: 'var(--color-success)' },
                { label: 'Fallidas',     value: results.failCount,                              color: 'var(--color-error)'   },
                { label: 'Saldo actual', value: balance ? formatPrice(balance.balance) : '...', color: 'var(--color-accent)'  },
              ].map((s) => (
                <div key={s.label} className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <p className="stat-label">{s.label}</p>
                  <p className="stat-value" style={{ fontSize: 20, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Tabla de resultados */}
            {results.results?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cliente</th>
                        <th>Correo</th>
                        <th>Resultado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((r) => (
                        <tr key={r.index}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.index}</td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{results.customerName}</td>
                          <td>{results.email}</td>
                          <td>
                            {r.success
                              ? <span className="badge badge-success">Exitosa</span>
                              : <span className="badge badge-danger">Fallida</span>
                            }
                          </td>
                          <td style={{ fontSize: 12, color: r.success ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {r.success ? 'Procesada' : r.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleReset}>
                <RefreshCw size={14} />
                Nueva compra rápida
              </button>
            </div>
          </div>
        )}

      </main>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
