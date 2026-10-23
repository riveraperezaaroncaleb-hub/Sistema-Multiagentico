import React, { useState } from 'react';
import { SPECIALISTS } from '../../constants/specialists';

export default function SpecialistSkillsModal({
  isOpen,
  onClose,
  selectedSpecialist,
  skills,
  onSaveSkill,
  onDeleteSkill
}) {
  const [role, setRole] = useState(selectedSpecialist?.id || 'directora');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isOpen) return null;

  const selectedAgent = SPECIALISTS.find(agent => agent.id === role) || SPECIALISTS[0];
  const roleSkills = skills.filter(skill => skill.role === role);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    const result = await onSaveSkill({ role, name, instructions });
    if (result.success) {
      setName('');
      setInstructions('');
      setStatusMessage({ type: 'success', text: `Skill aplicada automáticamente a ${selectedAgent.name}.` });
    } else {
      setStatusMessage({ type: 'error', text: result.error || 'No se pudo guardar la skill.' });
    }
    setIsSaving(false);
  };

  const handleDelete = async (skill) => {
    const result = await onDeleteSkill(skill.id);
    setStatusMessage(result.success
      ? { type: 'success', text: `Se quitó “${skill.name}” de ${selectedAgent.name}.` }
      : { type: 'error', text: result.error || 'No se pudo quitar la skill.' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        id="modal-specialist-skills"
        className="modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--outline-variant-40)',
          paddingBottom: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-md)'
        }}>
          <div>
            <h2 className="type-headline-md" style={{ fontSize: '18px', margin: 0 }}>Skills por IA</h2>
            <p className="type-label" style={{ color: 'var(--outline)', marginBottom: 0 }}>
              Crea instrucciones reutilizables y asígnalas al especialista que las aplicará.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Cerrar skills">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {statusMessage && (
          <div role="status" style={{
            padding: '8px 12px',
            borderRadius: 'var(--rounded-md)',
            marginBottom: 'var(--spacing-md)',
            fontSize: '13px',
            backgroundColor: statusMessage.type === 'success' ? 'rgba(78, 222, 163, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: statusMessage.type === 'success' ? 'var(--secondary)' : 'var(--error)'
          }}>
            {statusMessage.text}
          </div>
        )}

        <label className="type-label" htmlFor="skill-specialist" style={{ display: 'block', marginBottom: '6px' }}>
          IA a la que se aplicará la skill
        </label>
        <select
          id="skill-specialist"
          className="form-select"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          style={{ marginBottom: 'var(--spacing-md)' }}
        >
          {SPECIALISTS.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
          <option value="critico">Crítico (revisión automática)</option>
        </select>

        <div style={{
          padding: '12px',
          marginBottom: 'var(--spacing-md)',
          borderLeft: `3px solid ${selectedAgent.color}`,
          backgroundColor: 'var(--surface-lowest)',
          borderRadius: 'var(--rounded-md)',
          fontSize: '12px',
          color: 'var(--on-surface-variant)'
        }}>
          Las skills de <strong style={{ color: 'var(--on-surface)' }}>{role === 'critico' ? 'Crítico' : selectedAgent.name}</strong> se agregan a sus instrucciones y se envían con cada solicitud a su modelo.
        </div>

        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="type-overline" style={{ color: 'var(--outline)', marginBottom: '8px' }}>
            Skills activas para {role === 'critico' ? 'Crítico' : selectedAgent.name} ({roleSkills.length})
          </div>
          {roleSkills.length === 0 ? (
            <div style={{
              padding: '14px',
              border: '1px dashed var(--outline-variant)',
              borderRadius: 'var(--rounded-md)',
              color: 'var(--outline)',
              fontSize: '13px'
            }}>
              Todavía no hay skills para este puesto. Agrega una abajo; se aplicará automáticamente en sus próximas respuestas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roleSkills.map(skill => (
                <div key={skill.id} className="surface-level-2" style={{
                  padding: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <strong className="type-title" style={{ fontSize: '13px' }}>{skill.name}</strong>
                    <p style={{
                      whiteSpace: 'pre-wrap',
                      color: 'var(--on-surface-variant)',
                      fontSize: '12px',
                      margin: '5px 0 0',
                      overflowWrap: 'anywhere'
                    }}>{skill.instructions}</p>
                  </div>
                  <button type="button" onClick={() => handleDelete(skill)} className="btn btn-ghost btn-sm">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: 'var(--spacing-md)',
          backgroundColor: 'var(--surface-lowest)',
          border: '1px solid var(--outline-variant-40)',
          borderRadius: 'var(--rounded-lg)'
        }}>
          <div className="type-title" style={{ fontSize: '14px', color: 'var(--primary-soft)' }}>Crear y aplicar una skill</div>
          <label className="type-label" htmlFor="skill-name">Nombre</label>
          <input
            id="skill-name"
            className="form-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Ej. Respuestas con fuentes verificables"
            required
          />
          <label className="type-label" htmlFor="skill-instructions">Instrucciones para la IA</label>
          <textarea
            id="skill-instructions"
            className="form-input"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={6000}
            rows={5}
            placeholder="Describe concretamente el procedimiento, formato o criterios que debe seguir esta IA."
            required
            style={{ resize: 'vertical', minHeight: '100px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
              {isSaving ? 'Aplicando...' : 'Guardar y aplicar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
