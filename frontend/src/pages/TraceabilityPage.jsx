import { useState } from 'react';
import {
  BarChart2, Search, Download, TrendingUp, ShoppingBag,
  Wallet, CheckCircle, XCircle, Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import novaService from '../services/novaService';

// Fecha/hora local en formato datetime-local (YYYY-MM-DDTHH:mm)
function toLocalDatetimeInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toLocalDatetimeInput(d);
}

function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return toLocalDatetimeInput(d);
}

export default function TraceabilityPage() {
  const { toasts, toast, removeToast } = useToast();

  const [from, setFrom] = useState(todayStart());
  const [to, setTo]     = useState(todayEnd());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const formatPrice = (v) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  const formatDateLabel = (iso) =>
    new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));

  // ── Consultar ──────────────────────────────────────────────────────────────

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!from || !to) { toast.error('Selecciona un rango de fechas'); return; }
    if (new Date(from) > new Date(to)) { toast.error('La fecha de inicio debe ser anterior a la fecha fin'); return; }

    setLoading(true);
    setData(null);
    try {
      // Enviamos en ISO para el backend
      const fromISO = new Date(from).toISOString();
      const toISO   = new Date(to).toISOString();
      const res = await novaService.getAnalytics(fromISO, toISO);
      if (res.success) {
        setData(res.data);
        if (res.data.totalTransactions === 0) toast.error('No hay transacciones en ese rango');
      } else {
        toast.error(res.message || 'Error al consultar');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al consultar');
    } finally {
      setLoading(false);
    }
  };

  // ── Atajos de rango ────────────────────────────────────────────────────────

  const setQuickRange = (preset) => {
    const now = new Date();
    let f, t;
    if (preset === 'today') {
      f = new Date(now); f.setHours(0, 0, 0, 0);
      t = new Date(now); t.setHours(23, 59, 59, 0);
    } else if (preset === 'yesterday') {
      f = new Date(now); f.setDate(f.getDate() - 1); f.setHours(0, 0, 0, 0);
      t = new Date(now); t.setDate(t.getDate() - 1); t.setHours(23, 59, 59, 0);
    } else if (preset === 'week') {
      f = new Date(now); f.setDate(f.getDate() - 6); f.setHours(0, 0, 0, 0);
      t = new Date(now); t.setHours(23, 59, 59, 0);
    } else if (preset === 'month') {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
      t = new Date(now); t.setHours(23, 59, 59, 0);
    }
    setFrom(toLocalDatetimeInput(f));
    setTo(toLocalDatetimeInput(t));
  };

  // ── Exportar ───────────────────────────────────────────────────────────────

  const exportExcel = () => {
    if (!data) return;

    const summary = [
      { Concepto: 'Rango desde',         Valor: formatDateLabel(data.from) },
      { Concepto: 'Rango hasta',         Valor: formatDateLabel(data.to)   },
      { Concepto: 'Total transacciones', Valor: data.totalTransactions      },
      { Concepto: 'Exitosas',            Valor: data.successCount           },
      { Concepto: 'Fallidas',            Valor: data.failCount              },
      { Concepto: 'Total gastado',       Valor: data.totalSpent             },
    ];

    const detail = data.byProduct.map((p) => ({
      Producto:    p.productName,
      'ID Producto': p.productId ?? '—',
      Ventas:      p.count,
      Exitosas:    p.successCount,
      Fallidas:    p.failCount,
      'Total gastado': p.totalSpent,
      '% del total':   `${p.percentage}%`,
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summary);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    const wsDetail = XLSX.utils.json_to_sheet(detail);
    wsDetail['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Por Producto');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `trazabilidad_${data.from.slice(0,10)}_${data.to.slice(0,10)}.xlsx`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">

        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Trazabilidad</h1>
          <p className="page-subtitle">Analiza ventas y saldo gastado por rango de fechas</p>
        </div>

        {/* Filtros */}
        <form onSubmit={handleSearch}>
          <div className="history-filters" style={{ alignItems: 'flex-end', gap: '16px' }}>

            {/* Atajos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="filter-label">Rango rápido</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { k: 'today',     l: 'Hoy'       },
                  { k: 'yesterday', l: 'Ayer'       },
                  { k: 'week',      l: 'Últimos 7d' },
                  { k: 'month',     l: 'Este mes'   },
                ].map((r) => (
                  <button
                    key={r.k}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setQuickRange(r.k)}
                    style={{ fontSize: '12px', padding: '5px 10px' }}
                  >
                    {r.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Desde */}
            <div className="filter-group" style={{ minWidth: 200 }}>
              <label className="filter-label">Desde</label>
              <input
                className="filter-input"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>

            {/* Hasta */}
            <div className="filter-group" style={{ minWidth: 200 }}>
              <label className="filter-label">Hasta</label>
              <input
                className="filter-input"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>

            {/* Buscar */}
            <div className="filter-group" style={{ justifyContent: 'flex-end', minWidth: 'auto' }}>
              <label className="filter-label" style={{ opacity: 0 }}>.</label>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={loading}>
                {loading ? <><div className="spinner spinner-sm" />Consultando...</> : <><Search size={14} />Consultar</>}
              </button>
            </div>
          </div>
        </form>

        {/* Resultados */}
        {data && (
          <>
            {/* Rango consultado */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px', marginBottom: '24px',
              background: 'rgba(0,245,255,0.04)',
              border: '1px solid rgba(0,245,255,0.12)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px', color: 'var(--text-secondary)',
            }}>
              <Calendar size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span>
                <strong style={{ color: 'var(--color-primary)' }}>{formatDateLabel(data.from)}</strong>
                {' '}—{' '}
                <strong style={{ color: 'var(--color-primary)' }}>{formatDateLabel(data.to)}</strong>
              </span>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: '28px' }}>
              <div className="stat-card">
                <div className="stat-icon blue"><ShoppingBag size={20} /></div>
                <div>
                  <p className="stat-label">Total transacciones</p>
                  <p className="stat-value">{data.totalTransactions}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon amber"><Wallet size={20} /></div>
                <div>
                  <p className="stat-label">Saldo gastado</p>
                  <p className="stat-value">{formatPrice(data.totalSpent)}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon green"><CheckCircle size={20} /></div>
                <div>
                  <p className="stat-label">Exitosas</p>
                  <p className="stat-value" style={{ color: 'var(--color-success)' }}>{data.successCount}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(255,0,110,0.08)', color: 'var(--color-error)', borderColor: 'rgba(255,0,110,0.2)', boxShadow: 'var(--glow-secondary)', width: 48, height: 48 }}>
                  <XCircle size={20} />
                </div>
                <div>
                  <p className="stat-label">Fallidas</p>
                  <p className="stat-value" style={{ color: 'var(--color-error)' }}>{data.failCount}</p>
                </div>
              </div>
            </div>

            {/* Tabla por producto */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                <BarChart2 size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                Ventas por producto
              </div>
              <button className="btn btn-secondary btn-sm" onClick={exportExcel}>
                <Download size={14} />
                Exportar Excel
              </button>
            </div>

            {data.byProduct.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><TrendingUp size={40} /></div>
                  <p className="empty-state-text">Sin datos en este rango</p>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'center' }}>Ventas</th>
                        <th style={{ textAlign: 'center' }}>Exitosas</th>
                        <th style={{ textAlign: 'center' }}>Fallidas</th>
                        <th>Total gastado</th>
                        <th style={{ minWidth: 160 }}>% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byProduct.map((p) => (
                        <tr key={p.productId ?? p.productName}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {p.productName}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {p.count}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-success">{p.successCount}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {p.failCount > 0
                              ? <span className="badge badge-danger">{p.failCount}</span>
                              : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                            }
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                            {formatPrice(p.totalSpent)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {/* Barra de progreso */}
                              <div style={{
                                flex: 1, height: 6, borderRadius: 3,
                                background: 'rgba(255,255,255,0.06)',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  height: '100%',
                                  width: `${p.percentage}%`,
                                  background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                                  borderRadius: 3,
                                  transition: 'width 0.6s ease',
                                  boxShadow: 'var(--glow-primary)',
                                }} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 34, textAlign: 'right' }}>
                                {p.percentage}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* Fila de totales */}
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(0,245,255,0.15)' }}>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Total
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {data.totalTransactions}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-success)' }}>
                          {data.successCount}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: data.failCount > 0 ? 'var(--color-error)' : 'var(--text-muted)' }}>
                          {data.failCount > 0 ? data.failCount : '—'}
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--color-accent)', fontSize: 15, whiteSpace: 'nowrap' }}>
                          {formatPrice(data.totalSpent)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Estado inicial sin datos */}
        {!data && !loading && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="empty-state">
              <div className="empty-state-icon"><BarChart2 size={48} /></div>
              <p className="empty-state-text">Selecciona un rango y presiona Consultar</p>
            </div>
          </div>
        )}

      </main>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
