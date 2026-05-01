import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Send, X, AlertCircle, CheckCircle, Clock, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import novaService from '../services/novaService';

export default function HistoryPage() {
  const { toasts, toast, removeToast } = useToast();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const [filters, setFilters] = useState({ status: '', from: '', to: '' });

  // Paginación
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]           = useState(0);

  // Modal reenvío
  const [showResend, setShowResend]   = useState(false);
  const [selectedTx, setSelectedTx]   = useState(null);
  const [altEmail, setAltEmail]       = useState('');
  const [resending, setResending]     = useState(false);
  const [resendError, setResendError] = useState('');

  // ── Cargar historial ─────────────────────────────────────────────────────

  const loadHistory = useCallback(async (currentPage = 1, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await novaService.getHistory({
        ...filters,
        page: currentPage,
        limit: 50,
      });

      if (response.success) {
        setTransactions(response.data.transactions);
        setTotal(response.data.total);
        setTotalPages(response.data.totalPages);
        setPage(response.data.page);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cargar el historial');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    loadHistory(1);
  }, []);

  // ── Filtros ──────────────────────────────────────────────────────────────

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const applyFilters = (e) => {
    e.preventDefault();
    loadHistory(1);
  };

  const clearFilters = () => {
    setFilters({ status: '', from: '', to: '' });
    setTimeout(() => loadHistory(1), 0);
  };

  // ── Paginación ───────────────────────────────────────────────────────────

  const goToPage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadHistory(newPage);
  };

  // ── Reenvío ──────────────────────────────────────────────────────────────

  const openResend = (tx) => {
    setSelectedTx(tx);
    setAltEmail('');
    setResendError('');
    setShowResend(true);
  };

  const closeResend = () => {
    if (resending) return;
    setShowResend(false);
    setSelectedTx(null);
    setResendError('');
  };

  const handleResend = async (e) => {
    e.preventDefault();
    setResending(true);
    setResendError('');

    try {
      const response = await novaService.resendEmail(
        selectedTx.transactionId,
        altEmail.trim() || null
      );

      if (response.success) {
        toast.success('Correo reenviado exitosamente');
        closeResend();
      } else {
        setResendError(response.message || 'Error al reenviar el correo');
      }
    } catch (err) {
      setResendError(err.response?.data?.message || 'Error al reenviar el correo');
    } finally {
      setResending(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

  const formatDate = (dateStr) =>
    new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateStr));

  const canResend = (tx) => {
    const days = Math.floor((Date.now() - new Date(tx.createdAt)) / (1000 * 60 * 60 * 24));
    return days <= 5;
  };

  const getStatusBadge = (status) => {
    const map = {
      completed: { cls: 'badge-success', label: 'Completado' },
      pending:   { cls: 'badge-warning', label: 'Pendiente'  },
      failed:    { cls: 'badge-danger',  label: 'Fallido'    },
    };
    const s = map[status] || { cls: 'badge-default', label: status || 'Desconocido' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  // ── Render paginación ────────────────────────────────────────────────────

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const delta = 2;
    const left  = Math.max(1, page - delta);
    const right = Math.min(totalPages, page + delta);

    if (left > 1) {
      pages.push(1);
      if (left > 2) pages.push('...');
    }

    for (let i = left; i <= right; i++) pages.push(i);

    if (right < totalPages) {
      if (right < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          style={{ padding: '6px 10px' }}
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px', fontSize: '13px' }}>
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p)}
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                border: `1px solid ${p === page ? 'var(--color-primary)' : 'var(--border)'}`,
                background: p === page ? 'rgba(0,245,255,0.1)' : 'transparent',
                color: p === page ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: p === page ? 700 : 400,
                transition: 'all 0.15s',
              }}
            >
              {p}
            </button>
          )
        )}

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          style={{ padding: '6px 10px' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">

        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Historial</h1>
            <p className="page-subtitle">
              {total > 0 ? `${total} transacción${total !== 1 ? 'es' : ''} en total` : 'Todas tus transacciones'}
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadHistory(page, true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* Filtros */}
        <form onSubmit={applyFilters}>
          <div className="history-filters">
            <div className="filter-group">
              <label className="filter-label">Estado</label>
              <select
                className="filter-select"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
              >
                <option value="">Todos</option>
                <option value="completed">Completado</option>
                <option value="pending">Pendiente</option>
                <option value="failed">Fallido</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Desde</label>
              <input
                className="filter-input"
                type="date"
                name="from"
                value={filters.from}
                onChange={handleFilterChange}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Hasta</label>
              <input
                className="filter-input"
                type="date"
                name="to"
                value={filters.to}
                onChange={handleFilterChange}
              />
            </div>

            <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
              <label className="filter-label" style={{ opacity: 0 }}>.</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary btn-sm">
                  Buscar
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  Limpiar
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Tabla */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div className="spinner" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Package size={40} /></div>
              <p className="empty-state-text">No hay transacciones</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="transaction-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Cliente</th>
                    <th>Correo</th>
                    <th>Precio</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={12} />
                          {formatDate(tx.createdAt)}
                        </div>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{tx.productName}</td>
                      <td>{tx.customerName}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{tx.email}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                        {formatPrice(tx.price)}
                      </td>
                      <td>{getStatusBadge(tx.status)}</td>
                      <td>
                        {canResend(tx) ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openResend(tx)}
                          >
                            <Send size={13} />
                            Reenviar
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Expirado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginación */}
        {!loading && renderPagination()}

        {/* Contador */}
        {!loading && transactions.length > 0 && (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'right' }}>
            Mostrando {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} de {total}
          </p>
        )}

      </main>

      {/* Modal reenvío */}
      {showResend && selectedTx && (
        <div className="modal-overlay" onClick={closeResend}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Reenviar correo</h2>
                <p className="modal-subtitle">{selectedTx.productName} — {selectedTx.customerName}</p>
              </div>
              <button className="modal-close" onClick={closeResend}>
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '12px 16px', background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
              marginBottom: '20px', fontSize: '13px', color: 'var(--text-secondary)',
            }}>
              Correo original: <strong style={{ color: 'var(--text-primary)' }}>{selectedTx.email}</strong>
            </div>

            {resendError && (
              <div className="error-message">
                <AlertCircle size={14} />
                {resendError}
              </div>
            )}

            <form onSubmit={handleResend}>
              <div className="form-group">
                <label className="form-label">Correo alternativo (opcional)</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="Dejar vacío para usar el correo original"
                  value={altEmail}
                  onChange={(e) => setAltEmail(e.target.value)}
                  autoComplete="off"
                />
                <p className="form-hint">Si lo dejas vacío se reenvía al correo original</p>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeResend} disabled={resending}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={resending}>
                  {resending ? (
                    <><div className="spinner spinner-sm" />Enviando...</>
                  ) : (
                    <><CheckCircle size={15} />Reenviar correo</>
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