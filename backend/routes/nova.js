const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { validateUserIdMiddleware } = require('../middleware/userScope');
const {
  getProducts,
  getBalance,
  buyProduct,
  buyValidation,
  getHistory,
  getAnalytics,
  resendEmail,
  resendValidation,
  bulkBuy,
  bulkExecute,
  quickBuy,
  quickBuyValidation,
  updateCredentials,
} = require('../controllers/novaController');

// Primero valida el JWT, luego valida que el userId esté bien formado
router.use(authMiddleware);
router.use(validateUserIdMiddleware);

router.get('/products',      getProducts);
router.get('/balance',       getBalance);
router.post('/buy',          buyValidation, buyProduct);
router.post('/bulk',         bulkBuy);
router.get('/history',       getHistory);
router.get('/analytics',     getAnalytics);
router.post('/resend',       resendValidation, resendEmail);
router.post('/bulk/execute', bulkExecute);
router.post('/quick',        quickBuyValidation, quickBuy);
router.put('/credentials',   updateCredentials);

module.exports = router;