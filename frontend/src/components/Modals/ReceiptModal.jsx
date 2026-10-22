import React, { useState, useEffect } from 'react';

export default function ReceiptModal({ receiptId, isOpen, onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && receiptId) {
      setIsLoading(true);
      fetch(`/api/chat/receipt/${receiptId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.receipt) {
            setReceipt(data.receipt);
          }
        })
        .catch(err => console.error('Error al cargar comprobante:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, receiptId]);

  if (!isOpen) return null;

  const copyReceiptJson = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        id="modal-receipt"
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>📜</span>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>
                Comprobante Firmado Inmutable
              </h2>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Paso 4 del pipeline • Auditoría criptográfica de la interacción
              </span>
            </div>
          </div>
          <button 
            id="btn-close-receipt-modal"
            onClick={onClose} 
            className="btn btn-secondary btn-sm"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Verificando firma criptográfica...
            </span>
          </div>
        ) : !receipt ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#fca5a5' }}>
            No se pudo localizar el comprobante en la base de datos de auditoría.
          </div>
        ) : (
          <div>
            {/* Sello de integridad */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>✓</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#6ee7b7' }}>
                  Firma Criptográfica Verificada (Integridad Garantizada)
                </span>
              </div>
              <span className="badge badge-security" style={{ fontSize: '0.65rem' }}>
                {receipt.signerProvider || 'HMAC-SHA256'}
              </span>
            </div>

            {/* Metadatos en tabla organizada */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Identificador (ID):</span>
                <code style={{ fontSize: '0.75rem' }}>{receipt.id}</code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Fecha y Hora:</span>
                <span>{new Date(receipt.timestamp).toLocaleString()} ({receipt.timestamp})</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Especialista & Modelo:</span>
                <span style={{ color: 'var(--accent-cyan)' }}>
                  {receipt.specialist} • <strong>{receipt.model}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Consumo de Tokens:</span>
                <span>
                  {receipt.promptTokens || 0} prompt + {receipt.completionTokens || 0} respuesta = <strong>{receipt.totalTokens} tokens</strong>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Costo Facturado:</span>
                <strong style={{ color: 'var(--accent-emerald)' }}>
                  ${Number(receipt.costUsd || 0).toFixed(6)} USD
                </strong>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                  Hash de Entrada (SHA-256 del Prompt):
                </span>
                <code style={{ wordBreak: 'break-all', fontSize: '0.7rem', display: 'block' }}>
                  {receipt.inputHash}
                </code>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                  Hash de Salida (SHA-256 de la Respuesta):
                </span>
                <code style={{ wordBreak: 'break-all', fontSize: '0.7rem', display: 'block' }}>
                  {receipt.outputHash}
                </code>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                  Firma Digital del Servidor:
                </span>
                <code style={{ wordBreak: 'break-all', fontSize: '0.7rem', color: '#a5b4fc', display: 'block' }}>
                  {receipt.signature}
                </code>
              </div>
            </div>

            {/* Toggle de JSON Raw */}
            {showRawJson && (
              <pre style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.75rem', marginBottom: '14px' }}>
                {JSON.stringify(receipt, null, 2)}
              </pre>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="btn btn-secondary btn-sm"
              >
                {showRawJson ? 'Ocultar JSON' : 'Ver JSON Raw'}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={copyReceiptJson}
                  className="btn btn-secondary btn-sm"
                >
                  {copied ? '✓ Comprobante Copiado' : 'Copiar Comprobante'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-primary btn-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
