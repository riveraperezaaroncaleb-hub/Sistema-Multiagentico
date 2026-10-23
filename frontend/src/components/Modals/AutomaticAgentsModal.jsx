import React, { useState } from 'react';
import { SPECIALISTS } from '../../constants/specialists';

const AGENTS = [
  ...SPECIALISTS,
  { id: 'critico', name: 'Crítico', role: 'Revisión crítica', color: 'var(--agent-revisora)', icon: 'fact_check' }
];

export default function AutomaticAgentsModal({ isOpen, enabledRoles, onSave, onClose }) {
  const [selectedRoles, setSelectedRoles] = useState(enabledRoles);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const toggleRole = (role) => {
    setSelectedRoles(current => current.includes(role)
      ? current.filter(activeRole => activeRole !== role)
      : [...current, role]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    const result = await onSave(selectedRoles);
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'No se pudo guardar la configuración.');
    }
    setIsSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        id="modal-automatic-agents"
        className="modal-content"
        onClick={event => event.stopPropagation()}
        style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}
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
            <h2 className="type-headline-md" style={{ fontSize: '18px', margin: 0 }}>Intervenciones automáticas</h2>
            <p className="type-label" style={{ color: 'var(--outline)', marginBottom: 0 }}>
              Activa solo las IA que quieras que lean y evalúen cada conversación.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Cerrar configuración">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{
          padding: '12px',
          marginBottom: 'var(--spacing-md)',
          borderLeft: '3px solid var(--primary)',
          backgroundColor: 'var(--surface-lowest)',
          borderRadius: 'var(--rounded-md)',
          fontSize: '12px',
          color: 'var(--on-surface-variant)'
        }}>
          Cada IA activa revisa el mensaje y las respuestas recientes con su modelo conectado. Solo responde si tiene algo útil que aportar; se permiten como máximo 2 respuestas automáticas por turno. Las evaluaciones consumen tokens y pueden generar cargos aunque la IA decida no intervenir.
        </div>

        {error && (
          <div role="alert" style={{ color: 'var(--error)', marginBottom: 'var(--spacing-md)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
          {AGENTS.map(agent => (
            <label
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px',
                border: `1px solid ${selectedRoles.includes(agent.id) ? agent.color : 'var(--outline-variant-40)'}`,
                borderRadius: 'var(--rounded-md)',
                backgroundColor: 'var(--surface-lowest)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={selectedRoles.includes(agent.id)}
                onChange={() => toggleRole(agent.id)}
              />
              <span style={{ minWidth: 0 }}>
                <span className="type-label" style={{ display: 'block' }}>{agent.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--outline)' }}>{agent.role}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--spacing-lg)' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" disabled={isSaving}>Cancelar</button>
          <button type="button" onClick={handleSave} className="btn btn-primary btn-sm" disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar agentes activos'}
          </button>
        </div>
      </div>
    </div>
  );
}
