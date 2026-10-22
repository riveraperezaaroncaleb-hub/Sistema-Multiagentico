const express = require('express');
const router = express.Router();

const keysController = require('../controllers/keys.controller');
const budgetController = require('../controllers/budget.controller');
const chatController = require('../controllers/chat.controller');

// Rutas de LLaves BYOK cifradas
router.post('/keys', keysController.saveKey);
router.get('/keys', keysController.getKeys);
router.delete('/keys/:id', keysController.deleteKey);
router.post('/keys/detect', keysController.detectKey);

// Rutas de Presupuesto y Token Limiter
router.get('/budget', budgetController.getBudget);
router.post('/budget', budgetController.updateBudget);

// Rutas de Chat y Pipeline
router.post('/chat/send', chatController.sendMessage);
router.get('/chat/history', chatController.getHistory);
router.get('/chat/receipt/:receiptId', chatController.getReceipt);
router.post('/chat/clear', chatController.clearSession);

module.exports = router;
