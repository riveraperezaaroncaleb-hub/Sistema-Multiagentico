import React from 'react';

export default function ScreenShareModal({ isOpen, onClose, onConfirmShare }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        id="modal-screen-share"
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '24px' }}>visibility</span>
          <h2 className="type-headline-md" style={{ fontSize: '18px' }}>
            Compartir Pantalla (Ojos del Asistente)
          </h2>
        </div>

        {/* Aviso de consentimiento según Ley 8968 Costa Rica */}
        <div style={{
          backgroundColor: 'var(--surface-lowest)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--rounded-md)',
          padding: '12px 14px',
          marginBottom: '16px',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--on-surface-variant)'
        }}>
          <p style={{ marginBottom: '8px' }}>
            <strong>Consentimiento Informado (Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales):</strong>
          </p>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>La IA solo procesará el área visual que tú decidas compartir.</li>
            <li>Tratamos el contenido de pantalla como <strong>no confiable</strong> (protección contra inyecciones de prompt indirectas).</li>
            <li><strong>No se almacenan capturas</strong> de tu pantalla en bases de datos salvo petición explícita tuya.</li>
            <li>Las capturas se envían reducidas y exclusivamente bajo demanda.</li>
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)' }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button 
            id="btn-confirm-screen-share"
            onClick={() => {
              onConfirmShare();
              onClose();
            }} 
            className="btn btn-primary"
          >
            Entiendo, compartir
          </button>
        </div>
      </div>
    </div>
  );
}
