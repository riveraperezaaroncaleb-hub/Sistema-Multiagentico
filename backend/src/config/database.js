const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/ecosistema.sqlite';
const resolvedPath = path.resolve(process.cwd(), dbPath);

// Asegurar que el directorio contenedor exista
const dbDir = path.dirname(resolvedPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(resolvedPath);
// Activar WAL (Write-Ahead Logging) para mejor concurrencia y velocidad
db.pragma('journal_mode = WAL');

// Inicializar tablas necesarias
db.exec(`
  -- Tabla de llaves BYOK cifradas
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'general',
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    is_fallback INTEGER NOT NULL DEFAULT 0,
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    last4 TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role, is_fallback)
  );

  CREATE TABLE IF NOT EXISTS specialist_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role, name)
  );

  CREATE TABLE IF NOT EXISTS automatic_agents (
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, role)
  );

  -- Tabla de configuración de presupuestos
  CREATE TABLE IF NOT EXISTS budget_settings (
    user_id TEXT PRIMARY KEY,
    daily_limit_usd REAL NOT NULL DEFAULT 1.00,
    monthly_limit_usd REAL NOT NULL DEFAULT 25.00,
    daily_tokens_limit INTEGER NOT NULL DEFAULT 150000,
    monthly_tokens_limit INTEGER NOT NULL DEFAULT 3000000,
    alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de registro de uso y costos de cada interacción
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_id TEXT,
    specialist TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0.0,
    is_fallback_used INTEGER NOT NULL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de recibos firmados inmutables
  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    specialist TEXT NOT NULL,
    model TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    tokens_used INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    signature TEXT NOT NULL,
    raw_receipt_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabla de mensajes de chat para persistencia y contexto acotado
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    specialist TEXT,
    specialist_badge TEXT,
    content TEXT NOT NULL,
    receipt_id TEXT,
    code_reviewed INTEGER DEFAULT 0,
    is_fallback_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(receipt_id) REFERENCES receipts(id)
  );
`);

console.log(`✓ Base de datos SQLite lista en: ${resolvedPath}`);

module.exports = db;
