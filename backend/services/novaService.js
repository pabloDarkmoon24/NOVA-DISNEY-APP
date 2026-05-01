const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { decrypt } = require('./cryptoService');

const BASE_URL = process.env.NOVA_BASE_URL || 'https://mlvm.apiws.co';

// Cache de tokens por usuario: userId -> { token, refreshToken, expiresAt }
const tokenCache = new Map();

// Deduplica peticiones de autenticación concurrentes para el mismo usuario
const authPromises = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mensajes de error de la API Nova
const NOVA_ERRORS = {
  461: 'Correo no válido',
  462: 'Ya tiene una suscripción activa con ese correo',
  500: 'No fue posible realizar la transacción',
  511: 'Error de autenticación con la API Nova',
  520: 'El formato de la solicitud no es válido',
  521: 'Saldo insuficiente para la transacción',
  522: 'El producto solicitado no existe',
  523: 'El producto no está disponible temporalmente',
  524: 'Ya existe una transacción con esa referencia',
  525: 'La transacción no existe',
  526: 'No es posible reenviar después de 5 días de la compra',
};

class NovaUserService {
  constructor(userId, clientId, clientSecret) {
    this.userId = userId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // ── Autenticación ────────────────────────────────────────────────────────

  async authenticate() {
    const response = await this._request('POST', '/api/v2/oauth/token', {
      data: {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        scope: 'entertainment',
      },
    }, false);

    const expiresIn = response.expires_in || 3600;

    tokenCache.set(this.userId, {
      token: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000),
    });

    return response.access_token;
  }

  async refreshAccessToken() {
    const cached = tokenCache.get(this.userId);
    if (!cached?.refreshToken) return this.authenticate();

    try {
      const response = await this._request('POST', '/api/v2/oauth/token/refresh', {
        data: { refreshToken: cached.refreshToken },
      }, false);

      const expiresIn = response.expires_in || 3600;

      tokenCache.set(this.userId, {
        token: response.access_token,
        refreshToken: response.refresh_token || cached.refreshToken,
        expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000),
      });

      return response.access_token;
    } catch {
      return this.authenticate();
    }
  }

  async getValidToken() {
    const cached = tokenCache.get(this.userId);

    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    // Evita que llamadas paralelas (ej. products + balance) autentiquen dos veces
    if (authPromises.has(this.userId)) {
      return authPromises.get(this.userId);
    }

    const promise = (cached?.refreshToken ? this.refreshAccessToken() : this.authenticate())
      .finally(() => authPromises.delete(this.userId));

    authPromises.set(this.userId, promise);
    return promise;
  }

  // ── Métodos de negocio ───────────────────────────────────────────────────

  async getProducts() {
    const response = await this._request('GET', '/api/v2/entertainment/products');
    return response.data.products;
  }
async getBalance() {
  const response = await this._request('GET', '/api/v2/entertainment/balance');
  const amount = response.data?.balance?.prepaid ?? 0;  // ← agrega .data aquí
  return {
    balance: amount,
    currency: response.currency || 'COP',
  };
}

  async buyProduct({ customerName, email, productId }) {
    if (!email.includes('@') || !email.includes('.')) {
      throw new Error('El correo no es válido');
    }

    const reference = uuidv4();

    const response = await this._request('POST', '/api/v2/entertainment/buy', {
      data: { reference, customerName, email, productId },
    });

    return { ...response.data, reference };
  }

  async resendEmail({ reference, id, alternativeEmail = null }) {
    const body = { data: { reference, id } };
    if (alternativeEmail) body.data.alternativeEmail = alternativeEmail;

    const response = await this._request('POST', '/api/v2/entertainment/resend', body);
    return response;
  }

  async validatePurchase(productId) {
    const [products, balanceData] = await Promise.all([
      this.getProducts(),
      this.getBalance(),
    ]);

    const product = products.find((p) => p.id === productId);

    if (!product) {
      return { valid: false, error: 'El producto no existe', errorCode: 522 };
    }

    if (balanceData.balance < product.price) {
      return {
        valid: false,
        error: 'Saldo insuficiente',
        errorCode: 521,
        required: product.price,
        available: balanceData.balance,
      };
    }

    return { valid: true, product, balance: balanceData.balance };
  }
  

  // ── Método interno HTTP ──────────────────────────────────────────────────

  async _request(method, endpoint, data = null, useAuth = true, attempt = 0) {
    const headers = { 'Content-Type': 'application/json' };

    if (useAuth) {
      const token = await this.getValidToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await axios({
        method,
        url: `${BASE_URL}${endpoint}`,
        headers,
        data: data ?? undefined,
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;

        // Token expirado: limpiar cache y reintentar una vez
        if (status === 401 && attempt < 1) {
          tokenCache.delete(this.userId);
          authPromises.delete(this.userId);
          return this._request(method, endpoint, data, useAuth, attempt + 1);
        }

        // 429 o error del servidor: reintentar con backoff (máx 2 veces)
        if (attempt < 2 && (status === 429 || status >= 500)) {
          const delay = status === 429 ? 2000 * (attempt + 1) : 800 * (attempt + 1);
          await sleep(delay);
          return this._request(method, endpoint, data, useAuth, attempt + 1);
        }

        // Remapear el 401 de Nova al código 511 (error de autenticación Nova)
        // para que el frontend no lo confunda con un 401 propio (sesión expirada)
        // y cierre la sesión del usuario por error.
        const mappedStatus = status === 401 ? 511 : status;

        // Extraer el mensaje legible del body de Nova
        const novaBody = error.response.data;
        const novaMessage = novaBody?.error_description
          || novaBody?.message
          || novaBody?.error
          || novaBody?.detail
          || novaBody?.msg
          || null;

        const message = NOVA_ERRORS[mappedStatus]
          || (novaMessage ? `Nova API [${status}]: ${novaMessage}` : `Nova API error ${status}`);

        const err = new Error(message);
        err.status = mappedStatus;
        err.novaStatus = status;
        err.novaBody = novaBody;
        throw err;
      }

      // Error de red/timeout: reintentar una vez
      if (attempt < 1) {
        await sleep(1000);
        return this._request(method, endpoint, data, useAuth, attempt + 1);
      }

      throw new Error(`Error de conexión con Nova: ${error.message}`);
    }
  }
}

// ── Factory: crea una instancia por usuario usando sus credenciales cifradas ──

async function getNovaService(userId, encryptedClientId, encryptedClientSecret) {
  try {
    // Si estamos en modo local bypass, permitir credenciales en texto plano
    // para no depender de ENCRYPTION_KEY / Firestore.
    if (process.env.LOCAL_AUTH_BYPASS === 'true') {
      return new NovaUserService(userId, encryptedClientId, encryptedClientSecret);
    }

    const clientId = decrypt(encryptedClientId);
    const clientSecret = decrypt(encryptedClientSecret);
    return new NovaUserService(userId, clientId, clientSecret);
  } catch {
    throw new Error('No se pudieron descifrar las credenciales Nova. Verifica tu ENCRYPTION_KEY.');
  }
}

module.exports = { getNovaService };

