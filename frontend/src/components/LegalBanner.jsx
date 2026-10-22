import React from 'react';

export default function LegalBanner() {
  return (
    <div id="legal-ai-disclosure" style={{
      background: 'rgba(99, 102, 241, 0.08)',
      borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
      padding: '6px 16px',
      fontSize: '0.78rem',
      color: 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      textAlign: 'center'
    }}>
      <span style={{ fontSize: '0.9rem' }}>⚖️</span>
      <span>
        <strong>Aviso Legal (Art. 50 Ley Europea de IA):</strong> Estás interactuando con Inteligencias Artificiales coordinadas. Todo contenido generado pasa por verificación de seguridad y comprobantes criptográficos.
      </span>
    </div>
  );
}
