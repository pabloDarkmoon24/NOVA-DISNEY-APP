const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  register,
  registerValidation,
  login,
  loginValidation,
  getProfile,
} = require('../controllers/authController');

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/profile', authMiddleware, getProfile);

module.exports = router;