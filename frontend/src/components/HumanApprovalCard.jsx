import React, { useState } from 'react';

export default function HumanApprovalCard({
  actionTitle = 'Ejecución de Automatización',
  actionDescription = 'El asistente de acciones n8n solicita autorización para enviar un correo resumen a los participantes del proyecto.',
  details = [
    { label: 'Destinatario', value: 'equipo-desarrollo@empresa.com' },
    { label: 'Costo estimado', value: '$0,0012 USD' },
    { label: 'Impacto', value: 'Envío externo irreversible' }
  ],
  onApprove,
  onReject
}) {
  const [decision, setDecision] = useState(null); // 'approved' | 'rejected'
  const [decisionTime, setDecisionTime] = useState(null);

  const handleApprove = () => {
    setDecision('approved');
    setDecisionTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (onApprove) onApprove();
  };

  const handleReject = () => {
    setDecision('rejected');
    setDecisionTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (onReject) onReject();
  };

  // Si ya se tomó una decisión, se colapsa a una sola línea como estipula design.md
  if (decision) {
    return (
      <div 
        className="surface-level-2"
        style={{
          width: '100%',
          minWidth: '320px',
          padding: '8px 14px',
          margin: '12px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderLeft: `3px solid ${decision === 'approved' ? 'var(--secondary)' : 'var(--error-strong)'}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span 
            className="material-symbols-outlined" 
            style={{ fontSize: '16px', color: decision === 'approved' ? 'var(--secondary)' : 'var(--error-strong)' }}
          >
            {decision === 'approved' ? 'check_circle' : 'cancel'}
          </span>
          <span>
            {decision === 'approved' ? 'Acción Aprobada por ti' : 'Acción Rechazada por ti'} • {decisionTime}
          </span>
        </div>
        <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)' }}>
          {actionTitle}
        </span>
      </div>
    );
  }

  return (
    <div className="approval-card">
      <div className="approval-card-header">
        <span className="material-symbols-outlined" style={{ color: 'var(--warning)', fontSize: '20px' }}>
          notification_important
        </span>
        <span className="type-overline" style={{ color: 'var(--warning)' }}>
          Aprobación Requerida (Humano al mando)
        </span>
      </div>

      <div className="approval-card-content">
        <div className="approval-card-info">
          <h4 className="type-title" style={{ fontSize: '15px', color: 'var(--on-surface)', marginBottom: '4px' }}>
            {actionTitle}
          </h4>
          <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '10px' }}>
            {actionDescription}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px' }}>
            {details.map((item, idx) => (
              <div key={idx} style={{ background: 'var(--surface-lowest)', padding: '4px 8px', borderRadius: 'var(--rounded-sm)' }}>
                <span style={{ color: 'var(--outline)' }}>{item.label}: </span>
                <strong style={{ color: 'var(--on-surface)' }}>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="approval-card-actions">
          <button onClick={handleReject} className="btn btn-reject">
            Rechazar
          </button>
          <button onClick={handleApprove} className="btn btn-approve">
            Aprobar
          </button>
        </div>
      </div>
    </div>
  );
}
