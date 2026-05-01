/**
 * userScope — Capa de aislamiento por usuario
 *
 * Extrae y valida el userId del JWT decodificado.
 * El aislamiento real está garantizado en la capa de base de datos mediante
 * Row Level Security (PostgreSQL) activado con withUserScope() en config/database.js.
 */

function assertUserId(req) {
  const userId = req.user?.userId;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    const err = new Error('Token sin userId — acceso denegado');
    err.status = 401;
    throw err;
  }

  return userId;
}

function getUserScope(req) {
  return { userId: assertUserId(req) };
}

function validateUserIdMiddleware(req, res, next) {
  try {
    assertUserId(req);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = { getUserScope, validateUserIdMiddleware };
