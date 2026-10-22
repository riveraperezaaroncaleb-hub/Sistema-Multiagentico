import React, { useState } from 'react';

export default function InspectionPanel({ isOpen, onClose, latestReceipt, budget, latestSecurity }) {
  const [copiedHash, setCopiedHash] = useState(null);

  if (!isOpen) return null;

  const copyHash = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(key);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <aside style={{
      width: '360px',
      backgroundColor: 'var(--surface-low)',
      borderLeft: '1px solid var(--outline-variant-40)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Encabezado del panel */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--outline-variant-40)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--secondary)' }}>verified_user</span>
          <span className="type-title" style={{ fontSize: '15px' }}>Confianza Visible</span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm" title="Colapsar panel">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div style={{ padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        
        {/* Tarjeta de Comprobante Firmado */}
        <div className="surface-level-2" style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="type-overline" style={{ color: 'var(--outline)' }}>Recibo Criptográfico</span>
            <span className="badge badge-verified">
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>check_circle</span>
              Verificado
            </span>
          </div>

          {latestReceipt ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span className="type-label" style={{ color: 'var(--outline)', display: 'block' }}>ID Comprobante</span>
                <span className="type-mono" style={{ fontSize: '11px', color: 'var(--on-surface)' }}>{latestReceipt.id}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <span className="type-label" style={{ color: 'var(--outline)', display: 'block' }}>Tokens</span>
                  <span className="type-mono" style={{ fontSize: '12px' }}>{latestReceipt.totalTokens || 0}</span>
                </div>
                <div>
                  <span className="type-label" style={{ color: 'var(--outline)', display: 'block' }}>Costo USD</span>
                  <span className="type-mono" style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                    ${(latestReceipt.costUsd || 0).toFixed(6)}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="type-label" style={{ color: 'var(--outline)' }}>Hash Entrada (SHA-256)</span>
                  <button onClick={() => copyHash(latestReceipt.inputHash, 'in')} className="btn btn-ghost btn-sm" style={{ height: '22px', padding: '0 6px', fontSize: '10px' }}>
                    {copiedHash === 'in' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <code style={{ fontSize: '10px', wordBreak: 'break-all', display: 'block' }}>
                  {latestReceipt.inputHash ? `${latestReceipt.inputHash.slice(0, 24)}...` : 'N/A'}
                </code>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="type-label" style={{ color: 'var(--outline)' }}>Hash Salida (SHA-256)</span>
                  <button onClick={() => copyHash(latestReceipt.outputHash, 'out')} className="btn btn-ghost btn-sm" style={{ height: '22px', padding: '0 6px', fontSize: '10px' }}>
                    {copiedHash === 'out' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <code style={{ fontSize: '10px', wordBreak: 'break-all', display: 'block' }}>
                  {latestReceipt.outputHash ? `${latestReceipt.outputHash.slice(0, 24)}...` : 'N/A'}
                </code>
              </div>

              <div>
                <span className="type-label" style={{ color: 'var(--outline)', display: 'block' }}>Firma Digital (HMAC)</span>
                <code style={{ fontSize: '10px', wordBreak: 'break-all', color: 'var(--primary-soft)', display: 'block' }}>
                  {latestReceipt.signature ? `${latestReceipt.signature.slice(0, 28)}...` : 'N/A'}
                </code>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--outline)', fontSize: '12px' }}>
              Envía un mensaje para generar el primer recibo inmutable.
            </div>
          )}
        </div>

        {/* Tarjeta de Seguridad VibeScan */}
        <div className="surface-level-2" style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="type-overline" style={{ color: 'var(--outline)' }}>VibeScan AI</span>
            <span className="badge badge-verified">
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>shield</span>
              Código Revisado
            </span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            {latestSecurity?.summary || 'Inspección activa: Fugas de API Keys neutralizadas automáticamente y validación contra eval(), exec() e inyecciones.'}
          </div>
        </div>

        {/* Tarjeta de Límites de Presupuesto */}
        <div className="surface-level-2" style={{ padding: 'var(--spacing-md)' }}>
          <span className="type-overline" style={{ color: 'var(--outline)', display: 'block', marginBottom: '8px' }}>
            Protección de Saldo (Token-Limiter)
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--outline)' }}>Consumo de hoy:</span>
              <strong className="type-mono">${(budget?.dailySpent || 0).toFixed(4)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--outline)' }}>Límite diario:</span>
              <span className="type-mono">${(budget?.dailyLimit || 1.0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--outline)' }}>Tokens acumulados:</span>
              <span className="type-mono">{(budget?.dailyTokens || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}
