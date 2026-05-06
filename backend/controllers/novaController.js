const { withUserScope } = require('../config/database');
const { getNovaService } = require('../services/novaService');
const { getUserScope } = require('../middleware/userScope');
const { body, validationResult } = require('express-validator');

// Cache de credenciales Nova por usuario para evitar leer la DB en cada request
const credentialsCache = new Map();
const CREDENTIALS_TTL  = 5 * 60 * 1000; // 5 minutos

// ── Validaciones ──────────────────────────────────────────────────────────────

exports.buyValidation = [
  body('customerName')
    .trim()
    .notEmpty().withMessage('El nombre del cliente es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('email')
    .trim()
    .notEmpty().withMessage('El correo del cliente es requerido')
    .isEmail().withMessage('El correo del cliente no es válido')
    .normalizeEmail(),
  body('productId')
    .notEmpty().withMessage('El producto es requerido')
    .isNumeric().withMessage('El ID del producto debe ser numérico'),
];

exports.resendValidation = [
  body('transactionId')
    .trim()
    .notEmpty().withMessage('El ID de transacción es requerido'),
  body('alternativeEmail')
    .optional()
    .isEmail().withMessage('El correo alternativo no es válido')
    .normalizeEmail(),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getServiceForUser(userId) {
  // Modo local: credenciales desde .env, sin tocar la DB
  if (process.env.LOCAL_AUTH_BYPASS === 'true') {
    const localClientId     = process.env.LOCAL_NOVA_CLIENT_ID;
    const localClientSecret = process.env.LOCAL_NOVA_CLIENT_SECRET;
    if (!localClientId || !localClientSecret) {
      const err = new Error('Faltan LOCAL_NOVA_CLIENT_ID / LOCAL_NOVA_CLIENT_SECRET en .env para modo local');
      err.status = 500;
      throw err;
    }
    return getNovaService(userId, localClientId, localClientSecret);
  }

  const now    = Date.now();
  const cached = credentialsCache.get(userId);
  if (cached && now - cached.cachedAt < CREDENTIALS_TTL) {
    return getNovaService(userId, cached.encryptedClientId, cached.encryptedClientSecret);
  }

  // RLS garantiza que solo se devuelven credenciales del propio usuario
  const result = await withUserScope(userId, async (client) => {
    return client.query(
      'SELECT nova_client_id, nova_client_secret FROM users WHERE id = $1',
      [userId]
    );
  });

  if (result.rows.length === 0) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }

  const { nova_client_id, nova_client_secret } = result.rows[0];

  if (!nova_client_id || !nova_client_secret) {
    const err = new Error('Este usuario no tiene credenciales Nova configuradas');
    err.status = 400;
    throw err;
  }

  credentialsCache.set(userId, {
    encryptedClientId:     nova_client_id,
    encryptedClientSecret: nova_client_secret,
    cachedAt:              now,
  });

  return getNovaService(userId, nova_client_id, nova_client_secret);
}

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors:  errors.array(),
    });
  }
  return null;
}

// Persiste una transacción. En modo bypass (dev sin DB) se omite silenciosamente.
async function saveTransaction(userId, data) {
  if (process.env.LOCAL_AUTH_BYPASS === 'true') return;

  await withUserScope(userId, async (client) => {
    return client.query(
      `INSERT INTO transactions
         (user_id, reference, customer_name, customer_email, product_id, product_name,
          price, nova_id, nova_transaction_id, status, activation_url, result, bulk)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        userId,
        data.reference,
        data.customerName,
        data.email,
        data.productId,
        data.productName,
        data.price,
        data.novaId        || null,
        data.transactionId,
        data.status        || 'completed',
        data.activationUrl || null,
        data.result        ? JSON.stringify(data.result) : null,
        data.bulk          || false,
      ]
    );
  });
}

// ── GET /api/nova/products ────────────────────────────────────────────────────

exports.getProducts = async (req, res) => {
  try {
    const { userId } = getUserScope(req);
    const nova       = await getServiceForUser(userId);
    const products   = await nova.getProducts();
    return res.json({ success: true, data: { products } });
  } catch (err) {
    console.error('Error en getProducts:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al obtener productos',
      ...(err.novaBody && { novaError: err.novaBody }),
    });
  }
};

// ── GET /api/nova/balance ─────────────────────────────────────────────────────

exports.getBalance = async (req, res) => {
  try {
    const { userId } = getUserScope(req);
    const nova       = await getServiceForUser(userId);
    const balance    = await nova.getBalance();
    return res.json({ success: true, data: balance });
  } catch (err) {
    console.error('Error en getBalance:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al obtener saldo',
      ...(err.novaBody && { novaError: err.novaBody }),
    });
  }
};

// ── POST /api/nova/buy ────────────────────────────────────────────────────────

exports.buyProduct = async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { customerName, email, productId } = req.body;
    const { userId } = getUserScope(req);
    const nova       = await getServiceForUser(userId);

    const validation = await nova.validatePurchase(Number(productId));
    if (!validation.valid) {
      return res.status(400).json({
        success:   false,
        message:   validation.error,
        errorCode: validation.errorCode,
        details:   { required: validation.required, available: validation.available },
      });
    }

    const purchase = await nova.buyProduct({ customerName, email, productId: Number(productId) });

    await saveTransaction(userId, {
      reference:     purchase.reference,
      customerName,
      email,
      productId:     Number(productId),
      productName:   validation.product.name,
      price:         validation.product.price,
      novaId:        purchase.id             || null,
      transactionId: purchase.transactionId  || purchase.reference,
      status:        purchase.status         || 'completed',
      activationUrl: purchase.activationUrl  || null,
      result:        purchase.result         || null,
      bulk:          false,
    });

    return res.json({ success: true, message: '¡Compra realizada exitosamente!', data: purchase });
  } catch (err) {
    console.error('Error en buyProduct:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al realizar la compra',
    });
  }
};

// ── GET /api/nova/history ─────────────────────────────────────────────────────

exports.getHistory = async (req, res) => {
  try {
    const { userId } = getUserScope(req);
    const { status, from, to, limit = 50, page = 1 } = req.query;

    const pageSize = Math.min(Number(limit), 50);
    const pageNum  = Math.max(Number(page), 1);
    const offset   = (pageNum - 1) * pageSize;

    const result = await withUserScope(userId, async (client) => {
      const conditions    = [];
      const filterParams  = [];

      if (status) {
        filterParams.push(status);
        conditions.push(`status = $${filterParams.length}`);
      }
      if (from) {
        filterParams.push(new Date(from + 'T00:00:00-05:00').toISOString());
        conditions.push(`created_at >= $${filterParams.length}`);
      }
      if (to) {
        filterParams.push(new Date(to + 'T23:59:59-05:00').toISOString());
        conditions.push(`created_at <= $${filterParams.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const n     = filterParams.length;

      const [countRes, dataRes] = await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS total FROM transactions ${where}`,
          filterParams
        ),
        client.query(
          `SELECT id, reference,
                  customer_name  AS "customerName",
                  customer_email AS email,
                  product_id     AS "productId",
                  product_name   AS "productName",
                  price::float8  AS price,
                  nova_id        AS "novaId",
                  nova_transaction_id AS "transactionId",
                  status,
                  activation_url AS "activationUrl",
                  result, bulk,
                  created_at     AS "createdAt"
           FROM transactions ${where}
           ORDER BY created_at DESC
           LIMIT $${n + 1} OFFSET $${n + 2}`,
          [...filterParams, pageSize, offset]
        ),
      ]);

      return { transactions: dataRes.rows, total: countRes.rows[0].total };
    });

    return res.json({
      success: true,
      data: {
        transactions: result.transactions,
        total:        result.total,
        page:         pageNum,
        pageSize,
        totalPages:   Math.ceil(result.total / pageSize),
      },
    });
  } catch (err) {
    console.error('Error en getHistory:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener el historial' });
  }
};

// ── POST /api/nova/resend ─────────────────────────────────────────────────────

exports.resendEmail = async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { transactionId, alternativeEmail } = req.body;
    const { userId } = getUserScope(req);

    // RLS garantiza que solo puede encontrar transacciones del propio usuario
    const result = await withUserScope(userId, async (client) => {
      return client.query(
        `SELECT reference, nova_id AS "novaId", created_at AS "createdAt"
         FROM transactions WHERE nova_transaction_id = $1 LIMIT 1`,
        [transactionId]
      );
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transacción no encontrada' });
    }

    const tx = result.rows[0];
    const daysDiff = Math.floor((Date.now() - new Date(tx.createdAt)) / (1000 * 60 * 60 * 24));

    if (daysDiff > 5) {
      return res.status(400).json({
        success:   false,
        message:   'No es posible reenviar después de 5 días de la compra',
        errorCode: 526,
      });
    }

    const nova        = await getServiceForUser(userId);
    const resendResult = await nova.resendEmail({
      reference:        tx.reference,
      id:               tx.novaId,
      alternativeEmail: alternativeEmail || null,
    });

    return res.json({ success: true, message: 'Correo reenviado exitosamente', data: resendResult });
  } catch (err) {
    console.error('Error en resendEmail:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al reenviar el correo',
    });
  }
};

// ── GET /api/nova/analytics ───────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const { userId } = getUserScope(req);
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Los parámetros from y to son requeridos' });
    }

    const fromDate = new Date(from);
    const toDate   = new Date(to);

    if (isNaN(fromDate) || isNaN(toDate)) {
      return res.status(400).json({ success: false, message: 'Fechas inválidas' });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ success: false, message: 'La fecha de inicio debe ser anterior a la fecha fin' });
    }

    const result = await withUserScope(userId, async (client) => {
      const params = [fromDate.toISOString(), toDate.toISOString()];

      const [totalsRes, byProductRes] = await Promise.all([
        client.query(
          `SELECT
             COUNT(*)::int                                                                    AS "totalTransactions",
             COALESCE(SUM(price)::float8, 0)                                                 AS "totalSpent",
             COUNT(*) FILTER (WHERE status IN ('completed','success') OR status IS NULL)::int AS "successCount",
             COUNT(*) FILTER (WHERE status = 'failed')::int                                  AS "failCount"
           FROM transactions
           WHERE created_at >= $1 AND created_at <= $2`,
          params
        ),
        client.query(
          `SELECT
             product_id                                                              AS "productId",
             product_name                                                            AS "productName",
             COUNT(*)::int                                                           AS count,
             COALESCE(SUM(price)::float8, 0)                                        AS "totalSpent",
             COUNT(*) FILTER (WHERE status = 'failed')::int                         AS "failCount",
             COUNT(*) FILTER (WHERE status != 'failed')::int                        AS "successCount"
           FROM transactions
           WHERE created_at >= $1 AND created_at <= $2
           GROUP BY product_id, product_name
           ORDER BY "totalSpent" DESC`,
          params
        ),
      ]);

      return { totals: totalsRes.rows[0], byProduct: byProductRes.rows };
    });

    const { totals, byProduct } = result;
    const byProductWithPct = byProduct.map((p) => ({
      ...p,
      percentage: totals.totalSpent > 0
        ? Math.round((p.totalSpent / totals.totalSpent) * 100)
        : 0,
    }));

    return res.json({
      success: true,
      data: {
        from: fromDate.toISOString(),
        to:   toDate.toISOString(),
        ...totals,
        byProduct: byProductWithPct,
      },
    });
  } catch (err) {
    console.error('Error en getAnalytics:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener el análisis' });
  }
};

// ── POST /api/nova/bulk ───────────────────────────────────────────────────────

exports.bulkBuy = async (req, res) => {
  try {
    const { items }  = req.body;
    const { userId } = getUserScope(req);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'La lista de compras está vacía' });
    }
    if (items.length > 100) {
      return res.status(400).json({ success: false, message: 'Máximo 100 compras por lote' });
    }

    const nova = await getServiceForUser(userId);
    const [products, balanceData] = await Promise.all([nova.getProducts(), nova.getBalance()]);

    const validated = items.map((item, index) => {
      const errors   = [];
      if (!item.customerName?.trim()) errors.push('Nombre requerido');
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!item.email?.trim() || !emailRegex.test(item.email.trim())) errors.push('Correo inválido');
      const productId = Number(item.productId);
      const product   = products.find((p) => p.id === productId);
      if (!product) errors.push('Producto no existe');
      return {
        index,
        customerName: item.customerName?.trim(),
        email:        item.email?.trim().toLowerCase(),
        productId,
        product:      product || null,
        valid:        errors.length === 0,
        errors,
      };
    });

    const validItems = validated.filter((i) => i.valid);
    const totalCost  = validItems.reduce((sum, i) => sum + (i.product?.price || 0), 0);

    return res.json({
      success: true,
      message: 'Lote validado correctamente',
      data: {
        validated,
        totalCost,
        availableBalance: balanceData.balance,
        validCount:       validItems.length,
        invalidCount:     validated.length - validItems.length,
        hasBalance:       balanceData.balance >= totalCost,
      },
    });
  } catch (err) {
    console.error('Error en bulkBuy:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al procesar el lote',
    });
  }
};

// ── POST /api/nova/bulk/execute ───────────────────────────────────────────────

exports.bulkExecute = async (req, res) => {
  try {
    const { items }  = req.body;
    const { userId } = getUserScope(req);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'La lista de compras está vacía' });
    }
    if (items.length > 100) {
      return res.status(400).json({ success: false, message: 'Máximo 100 compras por lote' });
    }

    const nova     = await getServiceForUser(userId);
    const products = await nova.getProducts();
    const results  = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const purchase = await nova.buyProduct({
          customerName: item.customerName,
          email:        item.email,
          productId:    Number(item.productId),
        });

        const product = products.find((p) => p.id === Number(item.productId));

        await saveTransaction(userId, {
          reference:     purchase.reference,
          customerName:  item.customerName,
          email:         item.email,
          productId:     Number(item.productId),
          productName:   product?.name  || 'Desconocido',
          price:         product?.price || 0,
          novaId:        purchase.id             || null,
          transactionId: purchase.transactionId  || purchase.reference,
          status:        purchase.status         || 'completed',
          activationUrl: purchase.activationUrl  || null,
          result:        purchase.result         || null,
          bulk:          true,
        });

        results.push({ email: item.email, customerName: item.customerName, success: true, data: purchase });
      } catch (err) {
        results.push({ email: item.email, customerName: item.customerName, success: false, error: err.message });
      }

      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const successCount = results.filter((r) =>  r.success).length;
    const failCount    = results.filter((r) => !r.success).length;

    return res.json({
      success: true,
      message: `Lote ejecutado: ${successCount} exitosas, ${failCount} fallidas`,
      data:    { results, successCount, failCount },
    });
  } catch (err) {
    console.error('Error en bulkExecute:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error al ejecutar el lote',
    });
  }
};
