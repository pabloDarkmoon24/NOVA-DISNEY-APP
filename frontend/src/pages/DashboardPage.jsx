import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Wallet, Package, X, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import novaService from '../services/novaService';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toasts, toast, removeToast } = useToast();

  const [products, setProducts]     = useState([]);
  const [balance, setBalance]       = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [buying, setBuying]         = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({ customerName: '', email: '' });
  const [formError, setFormError] = useState('');

  // ── Cargar productos y saldo ─────────────────────────────────────────────

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoadingData(true);

    try {
      const [productsRes, balanceRes] = await Promise.all([
        novaService.getProducts(),
        novaService.getBalance(),
      ]);

      if (productsRes.success) setProducts(productsRes.data.products);
      if (balanceRes.success) setBalance(balanceRes.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cargar los datos');
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Modal ────────────────────────────────────────────────────────────────

  const openModal = (product) => {
    setSelectedProduct(product);
    setForm({ customerName: '', email: '' });
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (buying) return;
    setShowModal(false);
    setSelectedProduct(null);
    setFormError('');
  };

  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFormError('');
  };

  // ── Compra ───────────────────────────────────────────────────────────────

  const handleBuy = async (e) => {
    e.preventDefault();

    if (!form.customerName.trim()) {
      setFormError('El nombre del cliente es requerido');
      return;
    }
    if (!form.email.trim()) {
      setFormError('El correo del cliente es requerido');
      return;
    }

    setBuying(true);
    setFormError('');

    try {
      const response = await novaService.buyProduct(
        form.customerName.trim(),
        form.email.trim(),
        selectedProduct.id
      );

      if (response.success) {
        toast.success('¡Compra realizada exitosamente!');
        closeModal();
        loadData(true);
      } else {
        setFormError(response.message || 'Error al realizar la compra');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al realizar la compra';
      setFormError(msg);
    } finally {
      setBuying(false);
    }
  };

  // ── Formatear precio ─────────────────────────────────────────────────────

  const formatPrice = (price, currency = 'COP') => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">

        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Bienvenido, {user?.name}</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">
              <Wallet size={20} />
            </div>
            <div>
              <p className="stat-label">Saldo disponible</p>
              <p className="stat-value">
                {loadingData ? '...' : balance ? formatPrice(balance.balance, balance.currency) : '$0'}
              </p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              <Package size={20} />
            </div>
            <div>
              <p className="stat-label">Productos disponibles</p>
              <p className="stat-value">
                {loadingData ? '...' : products.length}
              </p>
            </div>
          </div>
        </div>

        {/* Productos */}
        <div className="section-title">Productos disponibles</div>

        {loadingData ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <div className="spinner" />
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Package size={40} />
            </div>
            <p className="empty-state-text">No hay productos disponibles</p>
          </div>
        ) : (
          <div className="products-grid">
            {products.map((product) => (
              <div
                key={product.id}
                className="product-card"
                onClick={() => openModal(product)}
              >
                <div>
                  <p className="product-name">{product.name}</p>
                  {product.description && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {product.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <p className="product-price">
                    {formatPrice(product.price, balance?.currency || 'COP')}
                    <span className="product-currency">{balance?.currency || 'COP'}</span>
                  </p>
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); openModal(product); }}>
                    <ShoppingCart size={13} />
                    Comprar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de compra */}
      {showModal && selectedProduct && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <div>
                <h2 className="modal-title">Confirmar compra</h2>
                <p className="modal-subtitle">{selectedProduct.name}</p>
              </div>
              <button className="modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            {/* Resumen del producto */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total a descontar</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--accent)' }}>
                {formatPrice(selectedProduct.price, balance?.currency || 'COP')}
              </span>
            </div>

            {formError && (
              <div className="error-message" style={{ marginBottom: '16px' }}>
                <AlertCircle size={14} />
                {formError}
              </div>
            )}

            <form onSubmit={handleBuy}>
              <div className="form-group">
                <label className="form-label">Nombre del cliente</label>
                <input
                  className="form-input"
                  type="text"
                  name="customerName"
                  placeholder="Nombre completo"
                  value={form.customerName}
                  onChange={handleFormChange}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Correo del cliente</label>
                <input
                  className="form-input"
                  type="email"
                  name="email"
                  placeholder="correo@cliente.com"
                  value={form.email}
                  onChange={handleFormChange}
                  required
                  autoComplete="off"
                />
                <p className="form-hint">
                  El correo donde se enviará la activación
                </p>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  disabled={buying}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={buying}
                >
                  {buying ? (
                    <>
                      <div className="spinner spinner-sm" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={15} />
                      Confirmar compra
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}