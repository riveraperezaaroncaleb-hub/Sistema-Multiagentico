const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api.routes');
const db = require('./config/database');
const { migrateLegacyApiKeys } = require('./services/legacyKeyMigration.service');

const app = express();
const PORT = process.env.PORT || 3001;

const migratedKeys = migrateLegacyApiKeys();
if (migratedKeys > 0) {
  console.log(`✓ Se actualizaron ${migratedKeys} API Keys cifradas con la clave maestra de desarrollo anterior.`);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Ecosistema Multi-IA - Etapa 1 MVP Base',
    timestamp: new Date().toISOString()
  });
});

// Rutas de API
app.use('/api', apiRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: `No existe la ruta de API ${req.method} ${req.originalUrl}.` });
});

// Manejador de errores no controlados
app.use((err, req, res, next) => {
  console.error('Error no controlado en Express:', err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 Servidor backend del Ecosistema Multi-IA corriendo en http://localhost:${PORT}`);
  });
}

// Cierre seguro
process.on('SIGINT', () => {
  console.log('\nCerrando servidor y base de datos SQLite...');
  db.close();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

module.exports = { app, server, PORT };
