import React, { useState } from 'react';

const PROVIDER_OPTIONS = [
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o'] },
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-1.5-flash', models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'] },
  { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] }
];

export default function KeysModal({ isOpen, onClose, keys = [], onSaveKey, onDeleteKey }) {
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [role, setRole] = useState('general');
  const [isFallback, setIsFallback] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState(null);

  // Auto-detección en tiempo real cuando el usuario pega o escribe la API Key
  const handleKeyChange = (val) => {
    setApiKey(val);
    const clean = val.trim();
    if (!clean) {
      setDetectedProvider(null);
      return;
    }

    if (clean.startsWith('sk-ant-')) {
      setProvider('anthropic');
      setModel('claude-3-5-sonnet-20241022');
      setDetectedProvider({ name: 'Anthropic Claude', model: 'claude-3-5-sonnet-20241022' });
    } else if (clean.startsWith('AIzaSy') || clean.startsWith('AIza')) {
      setProvider('gemini');
      setModel('gemini-1.5-flash');
      setDetectedProvider({ name: 'Google Gemini', model: 'gemini-1.5-flash' });
    } else if (clean.startsWith('gsk_')) {
      setProvider('groq');
      setModel('llama-3.3-70b-versatile');
      setDetectedProvider({ name: 'Groq', model: 'llama-3.3-70b-versatile' });
    } else if (clean.startsWith('sk-proj-') || (clean.startsWith('sk-') && clean.length >= 25)) {
      setProvider('openai');
      setModel('gpt-4o-mini');
      setDetectedProvider({ name: 'OpenAI', model: 'gpt-4o-mini' });
    } else {
      setDetectedProvider(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    const result = await onSaveKey({
      provider,
      model,
      role,
      isFallback,
      apiKey: apiKey.trim()
    });

    setIsSubmitting(false);
    if (result.success) {
      setApiKey('');
      setStatusMessage({ type: 'success', text: '✓ Llave cifrada con AES-256-GCM y guardada de forma segura.' });
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', text: result.error || 'Error al guardar la llave.' });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        id="modal-keys" 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px' }}
      >
        {/* Cabecera del Modal */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-md)',
          borderBottom: '1px solid var(--outline-variant-40)',
          paddingBottom: 'var(--spacing-sm)'
        }}>
          <div>
            <h2 className="type-headline-md" style={{ fontSize: '18px' }}>
              Llaves del Usuario (BYOK) & Proveedores
            </h2>
            <p className="type-label" style={{ color: 'var(--outline)' }}>
              Cifrado AES-256-GCM. La llave nunca se muestra completa de nuevo ni se expone al navegador.
            </p>
          </div>
          <button id="btn-close-keys-modal" onClick={onClose} className="btn btn-ghost btn-sm">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {statusMessage && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 'var(--rounded-md)',
            marginBottom: 'var(--spacing-md)',
            fontSize: '13px',
            backgroundColor: statusMessage.type === 'success' ? 'rgba(78, 222, 163, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: statusMessage.type === 'success' ? 'var(--secondary)' : 'var(--error)',
            border: `1px solid ${statusMessage.type === 'success' ? 'var(--secondary)' : 'var(--error-strong)'}`
          }}>
            {statusMessage.text}
          </div>
        )}

        {/* Formulario para registrar o reemplazar llave */}
        <form onSubmit={handleSubmit} style={{
          backgroundColor: 'var(--surface-lowest)',
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--rounded-lg)',
          border: '1px solid var(--outline-variant-40)',
          marginBottom: 'var(--spacing-lg)'
        }}>
          <div className="type-title" style={{ fontSize: '14px', color: 'var(--primary-soft)', marginBottom: '10px' }}>
            + Registrar o Reemplazar Llave
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label className="type-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--outline)' }}>Proveedor</label>
              <select className="form-select" value={provider} onChange={handleProviderChange}>
                {PROVIDER_OPTIONS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="type-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--outline)' }}>Modelo Predeterminado</label>
              <select className="form-select" value={model} onChange={(e) => setModel(e.target.value)}>
                {currentProviderConfig.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label className="type-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--outline)' }}>Puesto Asignado</label>
              <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="general">General (Ecosistema Base)</option>
                <option value="directora">Directora (Orquestadora)</option>
                <option value="programadora">Programadora</option>
                <option value="redactora">Redactora</option>
                <option value="investigadora">Investigadora</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  id="chk-key-fallback"
                  type="checkbox"
                  checked={isFallback}
                  onChange={(e) => setIsFallback(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                />
                <span>Es IA de Reserva (Failover)</span>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="type-label" style={{ color: 'var(--outline)' }}>
                API Key Secreta
              </label>
              {detectedProvider && (
                <span className="badge badge-verified" style={{ fontSize: '10px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>auto_awesome</span>
                  Auto-detectado: {detectedProvider.name}
                </span>
              )}
            </div>
            <input
              id="input-key-secret"
              type="password"
              className="form-input"
              placeholder="Solo pega tu API Key (OpenAI, Gemini, Claude, Groq)..."
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              required
            />
            <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)', display: 'block', marginTop: '4px' }}>
              El sistema deduce el proveedor automáticamente a partir de la clave y asigna el modelo recomendado.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              id="btn-save-key"
              type="submit"
              disabled={isSubmitting || !apiKey.trim()}
              className="btn btn-primary btn-sm"
            >
              {isSubmitting ? 'Cifrando...' : 'Guardar Llave Cifrada'}
            </button>
          </div>
        </form>

        {/* Tarjetas de Proveedor según design.md */}
        <div>
          <div className="type-overline" style={{ color: 'var(--outline)', marginBottom: '8px' }}>
            Proveedores Configurados ({keys.length})
          </div>

          {keys.length === 0 ? (
            <div style={{
              padding: '16px',
              textAlign: 'center',
              backgroundColor: 'var(--surface-lowest)',
              borderRadius: 'var(--rounded-md)',
              fontSize: '13px',
              color: 'var(--outline)'
            }}>
              No tienes ninguna llave agregada. El sistema utilizará el <strong>Simulador Seguro</strong> para que pruebes el flujo sin costo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {keys.map((k) => (
                <div 
                  key={k.id}
                  className="surface-level-2"
                  style={{
                    padding: '12px var(--spacing-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderLeft: `3px solid ${k.isFallback ? 'var(--warning)' : 'var(--secondary)'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '24px' }}>
                      api
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong className="type-title" style={{ fontSize: '14px' }}>{k.provider.toUpperCase()}</strong>
                        <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)' }}>({k.model})</span>
                        {k.isFallback ? (
                          <span className="badge badge-warning">Failover</span>
                        ) : (
                          <span className="badge badge-verified">Titular</span>
                        )}
                      </div>
                      <div className="type-mono" style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                        Llave: <code>{k.maskedKey}</code> • Puesto: {k.role}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      id={`btn-delete-key-${k.id}`}
                      onClick={() => onDeleteKey(k.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--error-strong)' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
