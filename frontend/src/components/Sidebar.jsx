import React from 'react';
import { SPECIALISTS } from '../constants/specialists';

export default function Sidebar({ activeTab, onSelectTab, onOpenKeys, onOpenBudget, onOpenSkills, onOpenAutomaticAgents, onClearHistory, isClearingHistory, selectedSpecialist, onSelectSpecialist }) {
  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--surface-low)',
      borderRight: '1px solid var(--outline-variant-40)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: 'var(--spacing-md) 0'
    }}>
      {/* Encabezado del Ecosistema */}
      <div style={{ padding: '0 var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--rounded-md)',
            backgroundColor: 'var(--primary)',
            color: 'var(--on-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>hub</span>
          </div>
          <div>
            <div className="type-title" style={{ fontSize: '15px' }}>Swarm Enterprise</div>
            <div className="type-overline" style={{ color: 'var(--outline)' }}>Ecosistema Multi-IA</div>
          </div>
        </div>
      </div>

      {/* Navegación Principal */}
      <nav style={{ padding: '0 var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
        <button
          onClick={() => onSelectTab('chat')}
          className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '4px', height: '36px' }}
        >
          <span className="material-symbols-outlined">chat</span>
          <span>Chat Orquestado</span>
        </button>

        <button
          onClick={() => onSelectTab('audit')}
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '4px', height: '36px' }}
        >
          <span className="material-symbols-outlined">verified_user</span>
          <span>Auditoría & Recibos</span>
        </button>

        <button
          onClick={onOpenKeys}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '4px', height: '36px' }}
        >
          <span className="material-symbols-outlined">key</span>
          <span>Llaves (BYOK)</span>
        </button>

        <button
          onClick={onOpenSkills}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '4px', height: '36px' }}
        >
          <span className="material-symbols-outlined">extension</span>
          <span>Skills por IA</span>
        </button>

        <button
          onClick={onOpenAutomaticAgents}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '4px', height: '36px' }}
        >
          <span className="material-symbols-outlined">forum</span>
          <span>Intervenciones automáticas</span>
        </button>

        <button
          onClick={onOpenBudget}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', height: '36px' }}
        >
          <span className="material-symbols-outlined">payments</span>
          <span>Control de Gasto</span>
        </button>

        <button
          type="button"
          onClick={onClearHistory}
          disabled={isClearingHistory}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', height: '36px', color: 'var(--error)' }}
        >
          <span className="material-symbols-outlined">delete_sweep</span>
          <span>{isClearingHistory ? 'Borrando historial...' : 'Borrar historial del chat'}</span>
        </button>
      </nav>

      {/* Lista de Especialistas de la Escuela */}
      <div style={{
        padding: '0 var(--spacing-md)',
        flex: 1,
        overflowY: 'auto'
      }}>
        <div className="type-overline" style={{ color: 'var(--outline)', marginBottom: 'var(--spacing-sm)' }}>
          Especialistas de la Escuela
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {SPECIALISTS.filter(agent => agent.id !== 'general').map(agent => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectSpecialist(agent)}
              aria-pressed={selectedSpecialist?.id === agent.id}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 8px',
                borderRadius: 'var(--rounded-md)',
                backgroundColor: selectedSpecialist?.id === agent.id ? 'var(--surface)' : 'rgba(255, 255, 255, 0.02)',
                border: 'none',
                borderLeft: `3px solid ${agent.color}`,
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: 'var(--rounded-full)',
                backgroundColor: 'var(--surface-lowest)',
                border: `1px solid ${agent.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: agent.color
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{agent.icon}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="type-label" style={{ color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {agent.name}
                </div>
                <div className="type-mono" style={{ fontSize: '10px', color: 'var(--outline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {agent.role}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Pie de navegación con estado legal */}
      <div style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderTop: '1px solid var(--outline-variant-40)',
        fontSize: '11px',
        color: 'var(--outline)'
      }}>
        <span className="badge badge-verified" style={{ fontSize: '10px', width: '100%', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>gavel</span>
          Art. 50 Ley Europea IA
        </span>
      </div>
    </aside>
  );
}
