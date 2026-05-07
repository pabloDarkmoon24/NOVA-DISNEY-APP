import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Upload, Download, CheckCircle, XCircle, AlertCircle,
  Play, RefreshCw, Zap, Info, FileSpreadsheet
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import novaService from '../services/novaService';

const STEPS = { UPLOAD: 1, PREVIEW: 2, EXECUTING: 3, RESULTS: 4 };

export default function BulkPage() {
  const { toasts, toast, removeToast } = useToast();
  const fileInputRef = useRef(null);

  const [step, setStep]                 = useState(STEPS.UPLOAD);
  const [products, setProducts]         = useState([]);
  const [balance, setBalance]           = useState(null);
  const [loadingData, setLoadingData]   = useState(true);

  const [fileName, setFileName]         = useState('');
  const [parseError, setParseError]     = useState('');

  const [validated, setValidated]       = useState([]);
  const [totalCost, setTotalCost]       = useState(0);
  const [validCount, setValidCount]     = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [hasBalance, setHasBalance]     = useState(true);
  const [validating, setValidating]     = useState(false);

  const [progress, setProgress]         = useState([]);
  const [results, setResults]           = useState(null);
  const isExecutingRef                  = useRef(false);

  // ── Cargar productos y saldo ─────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, balRes] = await Promise.all([
          novaService.getProducts(),
          novaService.getBalance(),
        ]);
        if (prodRes.success) setProducts(prodRes.data.products);
        if (balRes.success) setBalance(balRes.data);
      } catch {
        toast.error('Error al cargar productos');
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  // ── Descargar plantilla Excel ────────────────────────────────────────────

  const downloadTemplate = (productId) => {
    const product = products.find((p) => p.id === productId);

    const data = [
      { Nombre: 'Juan Pérez',   Correo: 'juan@correo.com',   ProductoID: productId },
      { Nombre: 'María López',  Correo: 'maria@correo.com',  ProductoID: productId },
      { Nombre: 'Carlos Ruiz',  Correo: 'carlos@correo.com', ProductoID: productId },
    ];

    const ws = XLSX.utils.json_to_sheet(data);

    // Ancho de columnas
    ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 15 }];

    // Estilo encabezado (color de fondo no soportado en xlsx básico pero sí el ancho)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compras');

    // Hoja de referencia con productos
    const refData = products.map((p) => ({
      ProductoID: p.id,
      Nombre: p.name,
      Descripcion: p.description,
      Precio: p.price,
    }));
    const wsRef = XLSX.utils.json_to_sheet(refData);
    wsRef['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 40 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Productos');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `plantilla_${product?.name.replace(/ /g, '_') || productId}.xlsx`);
  };

  // ── Leer archivo Excel ───────────────────────────────────────────────────

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Leer primera hoja
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
          setParseError('El archivo está vacío o no tiene datos');
          return;
        }

        if (rows.length > 100) {
          setParseError('Máximo 100 filas por lote');
          return;
        }

        // Normalizar columnas (acepta variaciones de nombre)
        const items = rows.map((row) => {
          const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
          const getVal = (variants) => {
            for (const v of variants) {
              const key = Object.keys(row).find((k) => k.toLowerCase().trim() === v);
              if (key && row[key] !== '') return String(row[key]).trim();
            }
            return '';
          };

          return {
            customerName: getVal(['nombre', 'name', 'customername', 'customer_name']),
            email: getVal(['correo', 'email', 'mail']),
            productId: getVal(['productoid', 'producto_id', 'product_id', 'productid', 'id']),
          };
        });

        processItems(items);
      } catch (err) {
        setParseError('Error al leer el archivo. Asegúrate de que sea un .xlsx válido');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Validar items ────────────────────────────────────────────────────────

  const processItems = async (items) => {
    setValidating(true);
    setParseError('');

    try {
      const response = await novaService.bulkValidate(items);
      if (response.success) {
        setValidated(response.data.validated);
        setTotalCost(response.data.totalCost);
        setValidCount(response.data.validCount);
        setInvalidCount(response.data.invalidCount);
        setHasBalance(response.data.hasBalance);
        setStep(STEPS.PREVIEW);
      } else {
        setParseError(response.message);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Error al validar el lote');
    } finally {
      setValidating(false);
    }
  };

  // ── Ejecutar lote ────────────────────────────────────────────────────────

  const handleExecute = async () => {
    const validItems = validated.filter((i) => i.valid);
    if (validItems.length === 0 || isExecutingRef.current) return;

    isExecutingRef.current = true;
    setStep(STEPS.EXECUTING);
    setProgress(validItems.map((i) => ({ ...i, status: 'pending' })));

    try {
      const response = await novaService.bulkExecute(
        validItems.map((i) => ({
          customerName: i.customerName,
          email: i.email,
          productId: i.productId,
        }))
      );

      if (response.success) {
        setProgress(
          validItems.map((item, idx) => {
            const result = response.data.results[idx];
            return {
              ...item,
              status: result?.success ? 'success' : 'error',
              error: result?.error || null,
            };
          })
        );
        setResults(response.data);
        setStep(STEPS.RESULTS);

        const balRes = await novaService.getBalance();
        if (balRes.success) setBalance(balRes.data);

        toast.success(`${response.data.successCount} compras exitosas`);
      }
    } catch (err) {
      // No regresar al STEP 2 — el servidor pudo haber procesado compras antes del error.
      // Mostrar advertencia y dejar al usuario en RESULTS vacío para que revise el historial.
      const msg = err.response?.data?.message || err.message || 'Error de conexión';
      setResults({ results: [], successCount: 0, failCount: validItems.length, networkError: msg });
      setStep(STEPS.RESULTS);
      toast.error(`Error: ${msg}. Revisa el historial para verificar qué compras se procesaron.`);
    } finally {
      isExecutingRef.current = false;
    }
  };

  // ── Exportar resultados a Excel ──────────────────────────────────────────

  const exportResults = () => {
    if (!results) return;

    const data = results.results.map((r, i) => ({
      '#': i + 1,
      Nombre: r.customerName,
      Correo: r.email,
      Resultado: r.success ? 'Exitosa' : 'Fallida',
      Detalle: r.success ? 'Compra procesada correctamente' : r.error,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 35 }, { wch: 12 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `resultados_lote_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep(STEPS.UPLOAD);
    setFileName('');
    setParseError('');
    setValidated([]);
    setResults(null);
    setProgress([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">

        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Compras Masivas</h1>
            <p className="page-subtitle">Descarga la plantilla Excel, llénala y sube el archivo para procesar el lote</p>
          </div>
          {balance && (
            <div className="stat-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
              <div className="stat-icon blue" style={{ width: 36, height: 36 }}>
                <Zap size={16} />
              </div>
              <div>
                <p className="stat-label">Saldo</p>
                <p className="stat-value" style={{ fontSize: 16 }}>{formatPrice(balance.balance)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', alignItems: 'center' }}>
          {[
            { n: 1, label: 'Cargar' },
            { n: 2, label: 'Preview' },
            { n: 3, label: 'Ejecutando' },
            { n: 4, label: 'Resultados' },
          ].map((s, i, arr) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                background: step === s.n ? 'rgba(0,245,255,0.1)' : 'transparent',
                border: `1px solid ${step === s.n ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: step >= s.n ? 'var(--color-primary)' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600,
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700,
                  background: step > s.n ? 'var(--color-success)' : step === s.n ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                  color: step >= s.n ? 'var(--bg-darker)' : 'var(--text-muted)',
                }}>
                  {step > s.n ? '✓' : s.n}
                </span>
                {s.label}
              </div>
              {i < arr.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: UPLOAD ── */}
        {step === STEPS.UPLOAD && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Descargar plantilla */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Download size={18} style={{ color: 'var(--color-primary)' }} />
                <h2 className="section-title" style={{ margin: 0 }}>1. Descarga la plantilla</h2>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
                Cada plantilla ya tiene el ID del producto correcto. Incluye una hoja de referencia con todos los productos disponibles.
              </p>

              {loadingData ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                  <div className="spinner" />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {products.map((p) => (
                    <button
                      key={p.id}
                      className="btn btn-secondary"
                      style={{ justifyContent: 'space-between', textTransform: 'none', letterSpacing: 0 }}
                      onClick={() => downloadTemplate(p.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={14} style={{ color: 'var(--color-success)' }} />
                        <span style={{ fontSize: '13px' }}>{p.name}</span>
                      </div>
                      <span style={{ color: 'var(--color-accent)', fontSize: '13px', fontWeight: 700 }}>
                        {formatPrice(p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subir Excel */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Upload size={18} style={{ color: 'var(--color-primary)' }} />
                <h2 className="section-title" style={{ margin: 0 }}>2. Sube tu Excel</h2>
              </div>

              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '10px 14px', background: 'rgba(0,245,255,0.04)',
                border: '1px solid rgba(0,245,255,0.1)', borderRadius: 'var(--radius-md)',
                marginBottom: '20px',
              }}>
                <Info size={14} style={{ color: 'var(--color-primary)', marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  El archivo debe tener las columnas <strong style={{ color: 'var(--color-primary)' }}>Nombre</strong>, <strong style={{ color: 'var(--color-primary)' }}>Correo</strong> y <strong style={{ color: 'var(--color-primary)' }}>ProductoID</strong>. Máximo 100 filas.
                </p>
              </div>

              {/* Drop zone */}
              <div
                style={{
                  border: '2px dashed rgba(0,245,255,0.2)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: fileName ? 'rgba(0,245,255,0.04)' : 'transparent',
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    fileInputRef.current.files = e.dataTransfer.files;
                    handleFileChange({ target: { files: e.dataTransfer.files } });
                  }
                }}
              >
                <FileSpreadsheet
                  size={40}
                  style={{ color: fileName ? 'var(--color-success)' : 'var(--text-muted)', marginBottom: '12px' }}
                />
                {fileName ? (
                  <>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-success)' }}>{fileName}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {validating ? 'Validando...' : 'Archivo cargado'}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Arrastra tu Excel aquí
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      o haz clic para seleccionar
                    </p>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {validating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', color: 'var(--color-primary)', fontSize: '13px' }}>
                  <div className="spinner spinner-sm" />
                  Validando filas...
                </div>
              )}

              {parseError && (
                <div className="error-message" style={{ marginTop: '12px', marginBottom: 0 }}>
                  <AlertCircle size={14} />
                  {parseError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: PREVIEW ── */}
        {step === STEPS.PREVIEW && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {[
                { label: 'Total filas',  value: validated.length,      color: 'var(--color-primary)' },
                { label: 'Válidas',      value: validCount,             color: 'var(--color-success)' },
                { label: 'Con errores',  value: invalidCount,           color: 'var(--color-error)'   },
                { label: 'Costo total',  value: formatPrice(totalCost), color: 'var(--color-accent)'  },
              ].map((s) => (
                <div key={s.label} className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <p className="stat-label">{s.label}</p>
                  <p className="stat-value" style={{ fontSize: '20px', color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {!hasBalance && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 16px', background: 'rgba(255,0,110,0.06)',
                border: '1px solid rgba(255,0,110,0.25)', borderRadius: 'var(--radius-md)',
                color: 'var(--color-error)', fontSize: '14px',
              }}>
                <AlertCircle size={16} />
                Saldo insuficiente. Necesitas {formatPrice(totalCost)} pero tienes {formatPrice(balance?.balance || 0)}.
              </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="transaction-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Producto</th>
                      <th>Precio</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated.map((item) => (
                      <tr key={item.index}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{item.index + 1}</td>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.customerName || '—'}</td>
                        <td>{item.email || '—'}</td>
                        <td>{item.product?.name || <span style={{ color: 'var(--color-error)' }}>No encontrado</span>}</td>
                        <td style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                          {item.product ? formatPrice(item.product.price) : '—'}
                        </td>
                        <td>
                          {item.valid ? (
                            <span className="badge badge-success">✓ Válido</span>
                          ) : (
                            <span className="badge badge-danger" title={item.errors.join(', ')}>
                              ✗ {item.errors[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={handleReset}>
                <RefreshCw size={14} />
                Volver a cargar
              </button>
              <button
                className="btn btn-primary"
                style={{ width: 'auto' }}
                onClick={handleExecute}
                disabled={validCount === 0 || !hasBalance}
              >
                <Play size={15} />
                Ejecutar {validCount} compra{validCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: EXECUTING ── */}
        {step === STEPS.EXECUTING && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div className="spinner" />
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--color-primary)' }}>
                  Procesando compras...
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No cierres esta ventana</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {progress.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                }}>
                  <div style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
                    {item.status === 'pending' && <div className="spinner spinner-sm" />}
                    {item.status === 'success' && <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />}
                    {item.status === 'error'   && <XCircle size={16} style={{ color: 'var(--color-error)' }} />}
                  </div>
                  <span style={{ fontSize: '13px', flex: 1, color: 'var(--text-secondary)' }}>
                    {item.customerName} — {item.email}
                  </span>
                  {item.error && (
                    <span style={{ fontSize: '12px', color: 'var(--color-error)' }}>{item.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 4: RESULTS ── */}
        {step === STEPS.RESULTS && results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {results.networkError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '14px 16px', background: 'rgba(255,170,0,0.07)',
                border: '1px solid rgba(255,170,0,0.3)', borderRadius: 'var(--radius-md)',
                color: '#ffaa00', fontSize: '13px', lineHeight: 1.6,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Error de conexión durante la ejecución.</strong> Es posible que algunas compras sí se hayan procesado en el servidor.{' '}
                  <strong>No vuelvas a ejecutar el lote</strong> sin antes revisar el{' '}
                  <a href="/history" style={{ color: '#ffaa00' }}>historial de transacciones</a>.
                  <br /><span style={{ opacity: 0.7, fontSize: '12px' }}>{results.networkError}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {[
                { label: 'Exitosas',     value: results.successCount,                          color: 'var(--color-success)' },
                { label: 'Fallidas',     value: results.failCount,                             color: 'var(--color-error)'   },
                { label: 'Saldo actual', value: balance ? formatPrice(balance.balance) : '...', color: 'var(--color-accent)'  },
              ].map((s) => (
                <div key={s.label} className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <p className="stat-label">{s.label}</p>
                  <p className="stat-value" style={{ fontSize: '20px', color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="transaction-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Resultado</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((r, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{i + 1}</td>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.customerName}</td>
                        <td>{r.email}</td>
                        <td>
                          {r.success
                            ? <span className="badge badge-success">✓ Exitosa</span>
                            : <span className="badge badge-danger">✗ Fallida</span>
                          }
                        </td>
                        <td style={{ fontSize: '12px', color: r.success ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {r.success ? 'Compra procesada correctamente' : r.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={exportResults}>
                <Download size={14} />
                Exportar resultados
              </button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleReset}>
                <RefreshCw size={14} />
                Nueva carga masiva
              </button>
            </div>
          </div>
        )}

      </main>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}