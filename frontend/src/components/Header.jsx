import React from 'react';

export default function Header({
  budget,
  onOpenKeys,
  onOpenBudget,
  onOpenScreenShare,
  isInspectionOpen,
  onToggleInspection,
  keysCount = 0
}) {
  const dailySpent = budget?.dailySpent || 0;
  const dailyLimit = budget?.dailyLimit || 1.0;
  const dailyPercent = budget?.dailyPercent || 0;

  // Regla de color del medidor de gasto:
  // Verde <60%, ámbar 60–99%, rojo al llegar al tope (100%)
  let meterColor = 'var(--secondary)';
  if (dailyPercent >= 100) {
    meterColor = 'var(--error-strong)';
  } else if (dailyPercent >= 60) {
    meterColor = 'var(--warning)';
  }

  return (
    <header style={{
      height: '56px',
      backgroundColor: 'var(--surface-low)',
      borderBottom: '1px solid var(--outline-variant-40)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--spacing-lg)',
      zIndex: 100,
      position: 'sticky',
      top: 0
    }}>
      {/* Izquierda: Estado de la Directora y Ecosistema */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: 'var(--rounded-full)',
            backgroundColor: 'var(--secondary)'
          }} />
          <span className="type-label" style={{ color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <strong>Directora</strong> • En línea
          </span>
        </div>

        <span style={{ color: 'var(--outline-variant)' }}>|</span>

        {/* Medidor de Gasto del Día: Verde <60%, ámbar 60–99%, rojo al tope */}
        <div 
          onClick={onOpenBudget}
          title="Haz clic para ver o ajustar los límites diarios y mensuales"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 'var(--rounded-md)',
            backgroundColor: 'var(--surface-lowest)',
            border: '1px solid var(--outline-variant-40)'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: meterColor }}>payments</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="type-mono" style={{ fontSize: '11px', color: 'var(--on-surface)' }}>
                ${dailySpent.toFixed(2)} / ${dailyLimit.toFixed(2)}
              </span>
              <span className="type-mono" style={{ fontSize: '10px', color: meterColor }}>
                ({dailyPercent.toFixed(0)}%)
              </span>
            </div>
            {/* Barra delgada de progreso */}
            <div style={{
              width: '90px',
              height: '3px',
              backgroundColor: 'var(--outline-variant-40)',
              borderRadius: 'var(--rounded-full)',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, dailyPercent)}%`,
                height: '100%',
                backgroundColor: meterColor,
                transition: 'width 200ms ease-out'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Derecha: Botón Compartir Pantalla, Llaves BYOK e Inspección */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
        {/* Botón de Compartir Pantalla (Ojos) */}
        <button
          onClick={onOpenScreenShare}
          className="btn btn-secondary btn-sm"
          title="Compartir pantalla con consentimiento previo (Ley 8968)"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>screen_share</span>
          <span>Compartir pantalla</span>
        </button>

        {/* Botón de Llaves BYOK */}
        <button
          onClick={onOpenKeys}
          className="btn btn-secondary btn-sm"
          title="Gestionar API keys cifradas con AES-256-GCM"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>key</span>
          <span>Llaves</span>
          {keysCount > 0 && (
            <span className="badge badge-ai" style={{ padding: '0 5px', fontSize: '10px' }}>
              {keysCount}
            </span>
          )}
        </button>

        {/* Botón Toggle Panel de Inspección (Confianza Visible) */}
        <button
          onClick={onToggleInspection}
          className={`btn btn-sm ${isInspectionOpen ? 'btn-primary' : 'btn-ghost'}`}
          title="Alternar panel de auditoría e inspección criptográfica"
          style={{ width: '32px', padding: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>dock_to_left</span>
        </button>
      </div>
    </header>
  );
}
