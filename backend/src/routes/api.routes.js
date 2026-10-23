const express = require('express');
const router = express.Router();

const keysController = require('../controllers/keys.controller');
const budgetController = require('../controllers/budget.controller');
const chatController = require('../controllers/chat.controller');
const skillsController = require('../controllers/skills.controller');
const agentsController = require('../controllers/agents.controller');
const { createDocumentUploadMiddleware } = require('../services/document.service');

// Rutas de LLaves BYOK cifradas
router.post('/keys', keysController.saveKey);
router.get('/keys', keysController.getKeys);
router.post('/keys/:id/test', keysController.testKey);
router.delete('/keys/:id', keysController.deleteKey);
router.post('/keys/detect', keysController.detectKey);

router.get('/skills', skillsController.getSkills);
router.post('/skills', skillsController.createSkill);
router.delete('/skills/:id', skillsController.deleteSkill);

router.get('/agents/automatic', agentsController.getAutomaticAgents);
router.put('/agents/automatic', agentsController.saveAutomaticAgents);

// Rutas de Presupuesto y Token Limiter
router.get('/budget', budgetController.getBudget);
router.post('/budget', budgetController.updateBudget);

// Rutas de Chat y Pipeline
router.post('/chat/send', chatController.sendMessage);
router.post('/chat/document/extract', createDocumentUploadMiddleware(), chatController.extractDocument);
router.get('/chat/history', chatController.getHistory);
router.get('/chat/receipt/:receiptId', chatController.getReceipt);
router.post('/chat/clear', chatController.clearSession);

module.exports = router;
