const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, withUserScope } = require('../config/database');
const { encrypt } = require('../services/cryptoService');

// ── Validaciones ──────────────────────────────────────────────────────────────

exports.registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('email')
    .trim()
    .notEmpty().withMessage('El correo es requerido')
    .isEmail().withMessage('El correo no es válido')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener mínimo 8 caracteres')
    .matches(/[A-Z]/).withMessage('La contraseña debe tener al menos una mayúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe tener al menos un número'),
  body('clientId')
    .trim()
    .notEmpty().withMessage('El Client ID de Nova es requerido'),
  body('clientSecret')
    .trim()
    .notEmpty().withMessage('El Client Secret de Nova es requerido'),
];

exports.loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('El correo es requerido')
    .isEmail().withMessage('El correo no es válido')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es requerida'),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }
  return null;
}

// ── Register ──────────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { name, email, password, clientId, clientSecret } = req.body;

    // auth_email_exists es SECURITY DEFINER — omite RLS (no hay userId aún)
    const { rows: [{ auth_email_exists: exists }] } = await query(
      'SELECT auth_email_exists($1)', [email]
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una cuenta con ese correo',
      });
    }

    const hashedPassword        = await bcrypt.hash(password, 12);
    const encryptedClientId     = encrypt(clientId);
    const encryptedClientSecret = encrypt(clientSecret);

    // auth_create_user es SECURITY DEFINER — omite RLS para el INSERT inicial
    const { rows: [user] } = await query(
      'SELECT * FROM auth_create_user($1, $2, $3, $4, $5)',
      [name, email, hashedPassword, encryptedClientId, encryptedClientSecret]
    );

    const token = generateToken({ userId: user.id, email: user.email, name: user.name });

    return res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente',
      data: { token, user: { id: user.id, name: user.name, email: user.email } },
    });
  } catch (err) {
    // Violación de constraint UNIQUE (race condition entre check y insert)
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ya existe una cuenta con ese correo' });
    }
    console.error('Error en register:', err);
    return res.status(500).json({ success: false, message: 'Error al crear la cuenta' });
  }
};

// ── Login ─────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { email, password } = req.body;

    // Modo local sin base de datos (solo para desarrollo)
    if (process.env.LOCAL_AUTH_BYPASS === 'true') {
      const localEmail    = process.env.LOCAL_AUTH_EMAIL    || 'dev@local.test';
      const localPassword = process.env.LOCAL_AUTH_PASSWORD || '12345678';
      const localName     = process.env.LOCAL_AUTH_NAME     || 'Usuario Local';
      const localUserId   = process.env.LOCAL_AUTH_USER_ID  || 'local-dev-user';

      if (email !== localEmail || password !== localPassword) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }

      const token = generateToken({ userId: localUserId, email: localEmail, name: localName });
      return res.json({
        success: true,
        message: 'Sesión iniciada (modo local)',
        data: { token, user: { id: localUserId, name: localName, email: localEmail } },
      });
    }

    // auth_find_by_email es SECURITY DEFINER — omite RLS para buscar por email
    const { rows } = await query('SELECT * FROM auth_find_by_email($1)', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const token = generateToken({ userId: user.id, email: user.email, name: user.name });

    return res.json({
      success: true,
      message: 'Sesión iniciada',
      data: { token, user: { id: user.id, name: user.name, email: user.email } },
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
  }
};

// ── Profile ───────────────────────────────────────────────────────────────────

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    // withUserScope activa RLS: solo puede ver su propio row
    const result = await withUserScope(userId, async (client) => {
      return client.query(
        'SELECT id, name, email, created_at FROM users WHERE id = $1',
        [userId]
      );
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    return res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, createdAt: user.created_at },
    });
  } catch (err) {
    console.error('Error en getProfile:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener el perfil' });
  }
};
