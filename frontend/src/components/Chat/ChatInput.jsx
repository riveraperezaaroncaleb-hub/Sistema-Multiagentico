import React, { useState, useRef, useEffect } from 'react';

const STARTER_PROMPTS = [
  'Escribe una función en TypeScript para verificar si un string es palíndromo',
  'Redacta un correo solicitando extensión de 3 días con tono empático',
  'Investiga las 3 diferencias clave entre arquitecturas monolíticas y microservicios'
];

export default function ChatInput({ onSendMessage, isLoading, errorAlert }) {
  const [prompt, setPrompt] = useState('');
  const [activeSkill, setActiveSkill] = useState(null);
  const textareaRef = useRef(null);

  // Estimación aproximada de tokens para el contador mono
  const estimatedTokens = Math.max(0, Math.round(prompt.length / 4));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSendMessage(prompt.trim());
    setPrompt('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{
      maxWidth: '880px',
      margin: '0 auto',
      width: '100%',
      padding: '0 var(--spacing-md) var(--spacing-md) var(--spacing-md)'
    }}>
      {/* Alerta de bloqueo por presupuesto o bucle */}
      {errorAlert && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid var(--error-strong)',
          borderRadius: 'var(--rounded-md)',
          padding: '8px 12px',
          marginBottom: '10px',
          color: 'var(--error)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
          <span>{errorAlert}</span>
        </div>
      )}

      {/* Chip de skill activa (si existe) y sugerencias rápidas */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '8px',
        scrollbarWidth: 'none'
      }}>
        {activeSkill && (
          <span className="badge badge-ai" style={{ padding: '3px 8px' }}>
            <span>Skill: {activeSkill}</span>
            <button 
              onClick={() => setActiveSkill(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              ✕
            </button>
          </span>
        )}

        {STARTER_PROMPTS.map((p, i) => (
          <button
            key={i}
            onClick={() => setPrompt(p)}
            className="btn btn-ghost btn-sm"
            style={{
              height: '24px',
              padding: '0 8px',
              fontSize: '11px',
              border: '1px solid var(--outline-variant-40)',
              whiteSpace: 'nowrap',
              color: 'var(--outline)'
            }}
          >
            {p.slice(0, 48)}...
          </button>
        ))}
      </div>

      {/* Command Dock: Fijo abajo, radio 2xl, borde outline-variant, foco con borde primary + anillo 3px */}
      <form onSubmit={handleSubmit} className="command-dock">
        <div className="command-dock-row">
          {/* Selector / Botón adjuntar */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '32px', padding: 0, color: 'var(--outline)' }}
            title="Adjuntar contexto o documento"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>attach_file</span>
          </button>

          {/* Campo de texto */}
          <textarea
            id="chat-input-textarea"
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta o da una instrucción a la Directora y sus especialistas..."
            disabled={isLoading}
            className="command-dock-input"
          />

          {/* Botón Enviar */}
          <button
            id="btn-send-message"
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="btn btn-primary"
            style={{ height: '36px', minHeight: '36px', padding: '0 14px' }}
          >
            {isLoading ? (
              <div className="spinner" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
            )}
          </button>
        </div>

        {/* Pie del Command Dock: Tokens contador mono + pista Enter */}
        <div className="command-dock-footer">
          <span className="type-mono">
            {estimatedTokens} tokens aprox.
          </span>
          <span>
            Enter para enviar • Shift+Enter para nueva línea
          </span>
        </div>
      </form>
    </div>
  );
}
