const db = require('../config/database');

function getSkillsForRole(userId, role) {
  return db.prepare(`
    SELECT id, role, name, instructions, created_at
    FROM specialist_skills
    WHERE user_id = ? AND role = ?
    ORDER BY created_at ASC, id ASC
  `).all(userId, role);
}

function getSkillsPrompt(userId, role) {
  const skills = getSkillsForRole(userId, role);
  if (skills.length === 0) return '';

  const formattedSkills = skills.map(skill => `### ${skill.name}\n${skill.instructions}`).join('\n\n');
  return `\n\nAplica estas skills asignadas a tu puesto en esta solicitud:\n\n${formattedSkills}`;
}

module.exports = {
  getSkillsForRole,
  getSkillsPrompt
};
