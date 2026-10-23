const db = require('../config/database');
const { SPECIALISTS } = require('../services/specialists.service');

const MAX_AUTOMATIC_INTERVENTIONS = 2;

function getAutomaticAgents(req, res) {
  try {
    const userId = req.query.userId || 'default_user';
    const rows = db.prepare(`
      SELECT role FROM automatic_agents
      WHERE user_id = ?
      ORDER BY position ASC, role ASC
    `).all(userId);
    return res.json({
      success: true,
      enabledRoles: rows.map(row => row.role),
      maxResponsesPerTurn: MAX_AUTOMATIC_INTERVENTIONS
    });
  } catch (error) {
    console.error('Error al consultar agentes automáticos:', error);
    return res.status(500).json({ error: 'Error al consultar la configuración de agentes automáticos.' });
  }
}

function saveAutomaticAgents(req, res) {
  try {
    const { userId = 'default_user', enabledRoles } = req.body;
    if (!Array.isArray(enabledRoles) || enabledRoles.some(role => typeof role !== 'string')) {
      return res.status(400).json({ error: 'enabledRoles debe ser una lista de puestos de IA.' });
    }

    const uniqueRoles = [...new Set(enabledRoles)];
    const invalidRole = uniqueRoles.find(role => !Object.hasOwn(SPECIALISTS, role));
    if (invalidRole) {
      return res.status(400).json({ error: `No existe el puesto de IA "${invalidRole}".` });
    }

    const saveSettings = db.transaction(() => {
      db.prepare('DELETE FROM automatic_agents WHERE user_id = ?').run(userId);
      const insert = db.prepare(`
        INSERT INTO automatic_agents (user_id, role, position) VALUES (?, ?, ?)
      `);
      uniqueRoles.forEach((role, position) => insert.run(userId, role, position));
    });
    saveSettings();

    return res.json({
      success: true,
      enabledRoles: uniqueRoles,
      maxResponsesPerTurn: MAX_AUTOMATIC_INTERVENTIONS
    });
  } catch (error) {
    console.error('Error al guardar agentes automáticos:', error);
    return res.status(500).json({ error: 'Error al guardar la configuración de agentes automáticos.' });
  }
}

module.exports = {
  getAutomaticAgents,
  saveAutomaticAgents,
  MAX_AUTOMATIC_INTERVENTIONS
};
