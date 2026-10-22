import React from 'react';

const AGENTS = [
  { id: 'directora', name: 'Directora', role: 'Orquestadora', color: 'var(--agent-directora)', icon: 'school' },
  { id: 'programadora', name: 'Programadora', role: 'Código y Debug', color: 'var(--agent-programadora)', icon: 'terminal' },
  { id: 'redactora', name: 'Redactora', role: 'Contenido y Tono', color: 'var(--agent-redactora)', icon: 'edit_note' },
  { id: 'investigadora', name: 'Investigadora', role: 'Búsqueda y Fuentes', color: 'var(--agent-investigadora)', icon: 'travel_explore' },
  { id: 'analista', name: 'Analista de datos', role: 'Métricas y SQL', color: 'var(--agent-analista)', icon: 'analytics' },
  { id: 'creativa', name: 'Creativa visual', role: 'Prompts y Arte', color: 'var(--agent-creativa)', icon: 'palette' },
  { id: 'revisora', name: 'Revisora', role: 'Control de Calidad', color: 'var(--agent-revisora)', icon: 'fact_check' },
  { id: 'acciones', name: 'Asistente n8n', role: 'Automatizaciones', color: 'var(--agent-acciones)', icon: 'smart_toy' }
];

export default function Sidebar({ activeTab, onSelectTab, onOpenKeys, onOpenBudget }) {
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
          onClick={onOpenBudget}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start', height: '36px' }}
        >
          <span className="material-symbols-outlined">payments</span>
          <span>Control de Gasto</span>
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
          {AGENTS.map(agent => (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 8px',
                borderRadius: 'var(--rounded-md)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderLeft: `3px solid ${agent.color}`
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
            </div>
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
