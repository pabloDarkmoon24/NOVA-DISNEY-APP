require('dotenv').config();

const path    = require('path');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');
const { testConnection, query } = require('./config/database');

// ── Validar variables de entorno críticas ─────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'];
const missingEnv   = REQUIRED_ENV.filter((v) => !process.env[v]);
if (missingEnv.length > 0) {
  console.error(`\n❌ Faltan variables de entorno: ${missingEnv.join(', ')}`);
  console.error('   Revisa tu archivo .env\n');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const novaRoutes = require('./routes/nova');

const app   = express();
const PORT  = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== 'production';

// ── Trust proxy (rate limiting correcto detrás de Railway/Render/etc.) ────────
app.set('trust proxy', 1);

// ── Helmet (Security Headers) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:              ["'self'"],
        scriptSrc:               ["'self'"],
        styleSrc:                ["'self'", "'unsafe-inline'"],
        imgSrc:                  ["'self'", 'data:', 'https:'],
        fontSrc:                 ["'self'", 'https://fonts.gstatic.com'],
        connectSrc:              ["'self'"],
        objectSrc:               ["'none'"],
        frameSrc:                ["'none'"],
        frameAncestors:          ["'none'"],
        baseUri:                 ["'self'"],
        formAction:              ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // Strict-Transport-Security: fuerza HTTPS por 1 año
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    // X-Content-Type-Options: nosniff
    noSniff: true,
    // X-Frame-Options: DENY
    frameguard: { action: 'deny' },
    // X-XSS-Protection: desactivado (CSP es la defensa correcta en browsers modernos)
    xssFilter: false,
    // Referrer-Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // Cross-Origin-Embedder-Policy: desactivado (API consumida por frontend externo)
    crossOriginEmbedderPolicy: false,
    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    // Eliminar X-Powered-By
    hidePoweredBy: true,
    // X-DNS-Prefetch-Control
    dnsPrefetchControl: { allow: false },
  })
);

// Permissions-Policy (no incluido en helmet, se agrega manualmente)
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // peticiones internas / health check
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Logger ────────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ── Rate limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Demasiadas peticiones, intenta más tarde' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Demasiados intentos, espera 15 minutos' },
});

const buyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Límite de compras alcanzado, intenta más tarde' },
});

app.use('/api/',                   generalLimiter);
app.use('/api/auth/login',         authLimiter);
app.use('/api/auth/register',      authLimiter);
app.use('/api/nova/buy',           buyLimiter);
app.use('/api/nova/bulk/execute',  buyLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'OK', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'ERROR', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ── Rutas API ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/nova', novaRoutes);

// ── Frontend estático (solo en producción) ────────────────────────────────────
// El frontend React se sirve desde Express: todos los security headers de Helmet aplican.
if (!isDev) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  // SPA fallback: rutas no-API sirven index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ── Error handler global ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'Error interno del servidor',
  });
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
async function startServer() {
  await testConnection(); // falla rápido si la DB no está disponible
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║       Nova Panel API                 ║
║       Puerto: ${PORT}                    ║
║       Modo:   ${process.env.NODE_ENV || 'development'}          ║
╚══════════════════════════════════════╝
    `);
  });
}

startServer().catch((err) => {
  console.error('❌ Error al iniciar el servidor:', err.message);
  process.exit(1);
});

module.exports = app;
