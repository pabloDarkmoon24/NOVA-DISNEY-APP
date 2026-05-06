-- Nova Panel — PostgreSQL Schema + Row Level Security
-- Ejecutar como superusuario (usa la DATABASE_URL raíz de Railway una sola vez)
-- Comando: node scripts/migrate.js

-- ── Extensiones ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Rol de aplicación (sujeto a RLS, sin BYPASSRLS) ──────────────────────────
-- El backend corre como nova_app; las operaciones de auth usan funciones SECURITY DEFINER.
-- Cambia 'CHANGE_ME' por una contraseña segura y actualiza APP_DATABASE_URL en .env
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nova_app') THEN
    CREATE ROLE nova_app LOGIN PASSWORD '5ckt12rX5S5kq96qan3utb7UiYPgQVk';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nova_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO nova_app;

-- ── Tablas ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(50)  NOT NULL,
  email              VARCHAR(255) NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  nova_client_id     TEXT,
  nova_client_secret TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference           VARCHAR(255)   NOT NULL,
  customer_name       VARCHAR(100)   NOT NULL,
  customer_email      VARCHAR(255)   NOT NULL,
  product_id          INTEGER        NOT NULL,
  product_name        VARCHAR(255),
  price               DECIMAL(14, 2) NOT NULL DEFAULT 0,
  nova_id             VARCHAR(255),
  nova_transaction_id VARCHAR(255),
  status              VARCHAR(50)    NOT NULL DEFAULT 'pending',
  activation_url      TEXT,
  result              JSONB,
  bulk                BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_reference_unique UNIQUE (reference)
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email       ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_tx_user_id        ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_created   ON transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_nova_tx_id     ON transactions (nova_transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_status         ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_tx_created        ON transactions (created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Cada sesión solo puede ver/modificar sus propios datos.
-- El backend activa el contexto con: SELECT set_config('app.current_user_id', userId, true)
-- current_setting(..., true) devuelve '' si no está seteado → bloquea todo por defecto.

ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  USING     (id::text = current_setting('app.current_user_id', true))
  WITH CHECK (id::text = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS transactions_isolation ON transactions;
CREATE POLICY transactions_isolation ON transactions
  USING     (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ── Funciones SECURITY DEFINER (bypass RLS para auth) ────────────────────────
-- Corren como el propietario de las tablas (superusuario) y omiten las políticas.
-- Usadas solo para register/login donde aún no hay userId disponible.

CREATE OR REPLACE FUNCTION auth_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER(p_email));
$$;

CREATE OR REPLACE FUNCTION auth_find_by_email(p_email TEXT)
RETURNS TABLE (
  id                 UUID,
  name               VARCHAR(50),
  email              VARCHAR(255),
  password_hash      VARCHAR(255),
  nova_client_id     TEXT,
  nova_client_secret TEXT,
  created_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, email, password_hash, nova_client_id, nova_client_secret, created_at
  FROM users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_create_user(
  p_name               TEXT,
  p_email              TEXT,
  p_password_hash      TEXT,
  p_nova_client_id     TEXT,
  p_nova_client_secret TEXT
)
RETURNS TABLE (
  id         UUID,
  name       VARCHAR(50),
  email      VARCHAR(255),
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO users (name, email, password_hash, nova_client_id, nova_client_secret)
  VALUES (p_name, LOWER(p_email), p_password_hash, p_nova_client_id, p_nova_client_secret)
  RETURNING id, name, email, created_at;
$$;

-- ── Permisos para el rol nova_app ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON users        TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO nova_app;
GRANT EXECUTE ON FUNCTION auth_email_exists(TEXT)                            TO nova_app;
GRANT EXECUTE ON FUNCTION auth_find_by_email(TEXT)                           TO nova_app;
GRANT EXECUTE ON FUNCTION auth_create_user(TEXT, TEXT, TEXT, TEXT, TEXT)     TO nova_app;
