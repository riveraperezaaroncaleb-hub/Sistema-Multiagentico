const db = require('../config/database');
const { SPECIALISTS } = require('../services/specialists.service');

const MAX_SKILL_NAME_LENGTH = 80;
const MAX_SKILL_INSTRUCTIONS_LENGTH = 6000;

function getSkills(req, res) {
  try {
    const userId = req.query.userId || 'default_user';
    const skills = db.prepare(`
      SELECT id, role, name, instructions, created_at AS createdAt
      FROM specialist_skills
      WHERE user_id = ?
      ORDER BY role ASC, created_at ASC, id ASC
    `).all(userId);
    return res.json({ success: true, skills });
  } catch (error) {
    console.error('Error al obtener skills:', error);
    return res.status(500).json({ error: 'Error al consultar las skills.' });
  }
}

function createSkill(req, res) {
  try {
    const {
      userId = 'default_user',
      role,
      name,
      instructions
    } = req.body;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanInstructions = typeof instructions === 'string' ? instructions.trim() : '';

    if (!SPECIALISTS[role]) {
      return res.status(400).json({ error: 'Selecciona un puesto de IA válido.' });
    }
    if (!cleanName || cleanName.length > MAX_SKILL_NAME_LENGTH) {
      return res.status(400).json({ error: `El nombre de la skill debe tener entre 1 y ${MAX_SKILL_NAME_LENGTH} caracteres.` });
    }
    if (!cleanInstructions || cleanInstructions.length > MAX_SKILL_INSTRUCTIONS_LENGTH) {
      return res.status(400).json({ error: `Las instrucciones deben tener entre 1 y ${MAX_SKILL_INSTRUCTIONS_LENGTH} caracteres.` });
    }

    const result = db.prepare(`
      INSERT INTO specialist_skills (user_id, role, name, instructions)
      VALUES (?, ?, ?, ?)
    `).run(userId, role, cleanName, cleanInstructions);
    const skill = db.prepare(`
      SELECT id, role, name, instructions, created_at AS createdAt
      FROM specialist_skills
      WHERE id = ? AND user_id = ?
    `).get(result.lastInsertRowid, userId);

    return res.status(201).json({ success: true, skill });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ya existe una skill con ese nombre para esta IA.' });
    }
    console.error('Error al guardar skill:', error);
    return res.status(500).json({ error: 'Error al guardar la skill.' });
  }
}

function deleteSkill(req, res) {
  try {
    const userId = req.query.userId || 'default_user';
    const result = db.prepare(`
      DELETE FROM specialist_skills WHERE id = ? AND user_id = ?
    `).run(req.params.id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'No se encontró esa skill para este usuario.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar skill:', error);
    return res.status(500).json({ error: 'Error al eliminar la skill.' });
  }
}

module.exports = {
  getSkills,
  createSkill,
  deleteSkill
};
