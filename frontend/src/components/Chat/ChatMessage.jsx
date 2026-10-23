import React, { useState } from 'react';

// Mapeo oficial de colores y nombres de agentes según design.md
const AGENT_CONFIG = {
  general: { name: 'Asistente', color: 'var(--outline)', icon: 'smart_toy' },
  directora: { name: 'Directora', color: 'var(--agent-directora)', icon: 'school' },
  programadora: { name: 'Programadora', color: 'var(--agent-programadora)', icon: 'terminal' },
  redactora: { name: 'Redactora', color: 'var(--agent-redactora)', icon: 'edit_note' },
  investigadora: { name: 'Investigadora', color: 'var(--agent-investigadora)', icon: 'travel_explore' },
  analista: { name: 'Analista de datos', color: 'var(--agent-analista)', icon: 'analytics' },
  creativa: { name: 'Creativa visual', color: 'var(--agent-creativa)', icon: 'palette' },
  revisora: { name: 'Revisora', color: 'var(--agent-revisora)', icon: 'fact_check' },
  acciones: { name: 'Asistente n8n', color: 'var(--agent-acciones)', icon: 'smart_toy' },
  tutora: { name: 'Tutora', color: 'var(--agent-directora)', icon: 'school' },
  traductora: { name: 'Traductora', color: 'var(--agent-redactora)', icon: 'translate' },
  seguridad: { name: 'Especialista en seguridad', color: 'var(--agent-revisora)', icon: 'security' },
  critico: { name: 'Crítico', color: 'var(--agent-revisora)', icon: 'fact_check' }
};

export default function ChatMessage({ message, onOpenReceipt }) {
  const isUser = message.sender === 'user';
  const [copiedCodeIndex, setCopiedCodeIndex] = useState(null);

  // Copiar bloques de código
  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Renderizar bloques de código y texto
  const renderContent = (content) => {
    if (!content) return null;

    const parts = [];
    const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <div key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap', marginBottom: '8px' }}>
            {content.slice(lastIndex, match.index)}
          </div>
        );
      }

      const lang = match[1] || 'código';
      const code = match[2];
      const currentIndex = codeIndex;

      parts.push(
        <div key={`code-${match.index}`} style={{
          position: 'relative',
          margin: '12px 0',
          borderRadius: 'var(--rounded-md)',
          overflow: 'hidden',
          border: '1px solid var(--outline-variant)',
          backgroundColor: 'var(--surface-lowest)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 10px',
            backgroundColor: 'var(--surface-high)',
            borderBottom: '1px solid var(--outline-variant-40)',
            fontSize: '11px',
            color: 'var(--outline)'
          }}>
            <span className="type-mono">{lang}</span>
            <button
              onClick={() => copyToClipboard(code, currentIndex)}
              className="btn btn-ghost btn-sm"
              style={{ height: '22px', padding: '0 6px', fontSize: '11px' }}
            >
              {copiedCodeIndex === currentIndex ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre style={{ margin: 0, padding: '12px', background: 'transparent' }}>
            <code>{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
      codeIndex++;
    }

    if (lastIndex < content.length) {
      parts.push(
        <div key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap', marginBottom: '8px' }}>
          {content.slice(lastIndex)}
        </div>
      );
    }

    return parts.length > 0 ? parts : <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  };

  // 1. Mensaje de Usuario
  if (isUser) {
    return (
      <div 
        id={`msg-${message.id}`}
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 'var(--spacing-md)'
        }}
      >
        <div style={{
          maxWidth: '75%',
          backgroundColor: 'var(--surface-high)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--rounded-lg) var(--rounded-lg) var(--rounded-sm) var(--rounded-lg)',
          padding: '10px 16px',
          color: 'var(--on-surface)',
          fontSize: '14px',
          lineHeight: '22px'
        }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        </div>
      </div>
    );
  }

  // 2. Mensaje de IA
  const specialistName = (message.specialist || '').toLowerCase();
  const agentKey = Object.entries(AGENT_CONFIG).find(([, config]) =>
    specialistName.includes(config.name.toLowerCase())
  )?.[0] || 'directora';

  const agent = AGENT_CONFIG[agentKey] || AGENT_CONFIG.directora;
  const timeFormatted = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div 
      id={`msg-${message.id}`}
      className="ai-message-container"
      style={{ borderLeftColor: agent.color }}
    >
      {/* Cabecera del mensaje de IA */}
      <div className="ai-message-header">
        <div 
          className="ai-avatar"
          style={{ borderColor: agent.color, color: agent.color }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{agent.icon}</span>
        </div>

        <strong className="type-title" style={{ fontSize: '14px', color: 'var(--on-surface)' }}>
          {agent.name}
        </strong>

        {/* Chip "Generado por IA" Obligatorio por Art. 50 */}
        <span className="badge badge-ai" style={{ fontSize: '10px' }}>
          Generado por IA
        </span>

        {/* Chip del modelo en tipografía JetBrains Mono */}
        <span className="badge badge-model">
          {message.receiptSummary?.model || 'gpt-4o-mini'}
        </span>

        {/* Hora */}
        <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)' }}>
          {timeFormatted}
        </span>

        {/* Alerta de contingencia / Failover */}
        {message.isFallbackUsed && (
          <span className="badge badge-warning">
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>sync_problem</span>
            Failover en uso
          </span>
        )}
      </div>

      {/* Cuerpo del Mensaje de IA (máximo 75 caracteres por línea e interlineado 160%) */}
      <div 
        className="ai-message-body"
        style={{ maxWidth: '75ch', lineHeight: 1.6 }}
      >
        {/* Bloque colapsable de Razonamiento (cerrado por defecto en mono) */}
        <details className="ai-reasoning">
          <summary>Razonamiento de la especialista</summary>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--outline)' }}>
            Solicitud procesada por {agent.name}
            {message.criticReview?.reviewed
              ? ` y revisada por Crítico en ${message.criticReview.roundsCount} ronda(s).`
              : message.criticReview?.error
                ? '. La revisión del Crítico no se completó.'
                : '.'}
          </div>
        </details>

        {renderContent(message.content)}

        {/* Pie del mensaje: Sello de Seguridad -> Botón Ver Comprobante -> Costo */}
        <div className="ai-message-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            {/* 1. Sello de seguridad VibeScan si hubo código */}
            {message.codeReviewed && (
              <span className="badge badge-verified">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>verified</span>
                Código revisado
              </span>
            )}

            {/* Sello del Crítico (Skill: revision-critica) */}
            {message.criticReview?.reviewed && message.criticReview.verdict === 'APROBADO' && (
              <span className="badge badge-verified" title="Aprobado por el Crítico del ecosistema">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>fact_check</span>
                Crítico: Aprobado
              </span>
            )}

            {message.criticReview?.requiresHumanDecision && (
              <span className="badge badge-warning" title="El crítico señaló observaciones tras 2 vueltas (Decide el humano)">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>rate_review</span>
                Crítico: Observaciones pendientes
              </span>
            )}
            {message.criticReview?.error && (
              <span className="badge badge-warning" title={message.criticReview.error}>
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>warning</span>
                Crítico no pudo revisar
              </span>
            )}

            {/* 2. Botón Ver Comprobante */}
            {message.receiptId && (
              <button
                id={`btn-receipt-${message.receiptId}`}
                onClick={() => onOpenReceipt(message.receiptId)}
                className="btn btn-ghost btn-sm"
                style={{ height: '24px', padding: '0 8px', fontSize: '11px', color: 'var(--primary-soft)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>receipt_long</span>
                Ver comprobante
              </button>
            )}
          </div>

          {/* 3. Costo del mensaje en tipografía mono */}
          <div className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)' }}>
            Costo: <span style={{ color: 'var(--on-surface)' }}>${Number(message.receiptSummary?.costUsd || 0).toFixed(4)} USD</span> • {message.receiptSummary?.tokens || 0} tokens
          </div>
        </div>
      </div>
    </div>
  );
}
