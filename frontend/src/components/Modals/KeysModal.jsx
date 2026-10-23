import React, { useRef, useState } from 'react';
import providers from '../../../../shared/provider-catalog.json';

export default function KeysModal({ isOpen, onClose, keys = [], onSaveKey, onTestKey, onDeleteKey }) {
  const [role, setRole] = useState('general');
  const [providerChoice, setProviderChoice] = useState('auto');
  const [isFallback, setIsFallback] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [testingKeyId, setTestingKeyId] = useState(null);
  const [detection, setDetection] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const detectionRequestRef = useRef(0);
  const apiKeyInputRef = useRef(null);

  const handleKeyChange = async (val) => {
    setApiKey(val);
    setDetectedProvider(null);
    setProviderChoice('auto');
    setDetection(null);
    setStatusMessage(null);
    const requestId = ++detectionRequestRef.current;
    if (!val.trim()) {
      setIsDetecting(false);
      return;
    }

    setIsDetecting(true);
    try {
      const response = await fetch('/api/keys/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: val.trim() })
      });
      const result = await response.json();
      if (requestId !== detectionRequestRef.current) return;
      setDetection(result);
      const matchedProvider = providers.find(provider => provider.id === result.provider);
      if (result.confidence === 'high' && matchedProvider) {
        setDetectedProvider(matchedProvider);
        setProviderChoice(matchedProvider.id);
      }
    } catch (error) {
      if (requestId === detectionRequestRef.current) {
        setStatusMessage({ type: 'error', text: `No se pudo detectar el proveedor: ${error.message}` });
      }
    } finally {
      if (requestId === detectionRequestRef.current) setIsDetecting(false);
    }
  };

  const handleProviderChoice = (providerId) => {
    setProviderChoice(providerId);
    if (providerId === 'auto') {
      const matchedProvider = providers.find(provider => provider.id === detection?.provider);
      setDetectedProvider(detection?.confidence === 'high' ? matchedProvider || null : null);
    } else {
      setDetectedProvider(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim() || isDetecting || (providerChoice === 'auto' && detection?.confidence !== 'high')) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const result = await onSaveKey({
        provider: providerChoice === 'auto' ? detectedProvider.id : providerChoice,
        role,
        isFallback,
        apiKey: apiKey.trim()
      });

      if (result.success) {
        setApiKey('');
        setDetectedProvider(null);
        setProviderChoice('auto');
        setDetection(null);
        setStatusMessage({ type: 'success', text: `API de ${result.provider || detectedProvider?.name} guardada. Pulsa “Probar conexión” para confirmar el acceso al modelo real.` });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Error al guardar la llave.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message || 'Error al guardar la llave.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestKey = async (key) => {
    setTestingKeyId(key.id);
    setStatusMessage(null);
    try {
      const result = await onTestKey(key.id);
      setStatusMessage(result.success
        ? { type: 'success', text: `Conexión real confirmada: ${result.provider} · ${result.model}. La prueba pudo generar un cargo mínimo del proveedor.` }
        : { type: 'error', text: result.error || 'No se pudo conectar con el proveedor.' });
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message || 'No se pudo probar la conexión.' });
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleReplaceKey = (key) => {
    setRole(key.role);
    setProviderChoice(key.provider);
    setDetectedProvider(null);
    setIsFallback(key.isFallback);
    setApiKey('');
    setDetection(null);
    setStatusMessage({
      type: 'error',
      text: `Pega una API Key nueva para ${key.role} y guárdala. Se reemplazará esta clave inaccesible sin cambiar las demás.`
    });
    apiKeyInputRef.current?.focus();
  };

  if (!isOpen) return null;

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

        {keys.some(key => key.isDecryptable === false) && (
          <div role="alert" style={{
            padding: '10px 12px',
            borderRadius: 'var(--rounded-md)',
            marginBottom: 'var(--spacing-md)',
            fontSize: '13px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            color: 'var(--error)',
            border: '1px solid var(--error-strong)'
          }}>
            Algunas claves se cifraron con una clave maestra distinta o sus datos están dañados. No es posible recuperar su contenido. Reemplaza cada clave marcada abajo pegándola de nuevo y mantén estable APP_ENCRYPTION_SECRET entre reinicios.
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
              <label className="type-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--outline)' }}>Puesto Asignado</label>
              <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="general">General (Ecosistema Base)</option>
                <option value="directora">Directora (Orquestadora)</option>
                <option value="programadora">Programadora</option>
                <option value="redactora">Redactora</option>
                <option value="investigadora">Investigadora</option>
                <option value="analista">Analista de datos</option>
                <option value="creativa">Creativa visual</option>
                <option value="revisora">Revisora</option>
                <option value="acciones">Asistente n8n</option>
                <option value="tutora">Tutora</option>
                <option value="traductora">Traductora</option>
                <option value="seguridad">Especialista en seguridad</option>
                <option value="critico">Crítico (revisión automática)</option>
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
          <p className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)', margin: '0 0 12px' }}>
            Cada puesto usa esta clave al responder. El Crítico revisa las respuestas con una clave propia o con la del especialista. Probar una conexión realiza una solicitud real pequeña y puede generar un cargo mínimo.
          </p>

          <div style={{ marginBottom: '12px' }}>
            <label className="type-label" htmlFor="select-provider" style={{ display: 'block', marginBottom: '4px', color: 'var(--outline)' }}>
              Proveedor de la API
            </label>
            <select
              id="select-provider"
              className="form-select"
              value={providerChoice}
              onChange={(event) => handleProviderChoice(event.target.value)}
              style={{ marginBottom: '10px' }}
            >
              <option value="auto">Detectar automáticamente cuando sea posible</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
            <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)', display: 'block', marginBottom: '10px' }}>
              {isDetecting
                ? 'Detectando proveedor…'
                : detectedProvider && providerChoice === detectedProvider.id
                ? `Detectado por prefijo: ${detectedProvider.name}.`
                : providerChoice !== 'auto'
                  ? `Proveedor seleccionado: ${providers.find(provider => provider.id === providerChoice)?.name}. Se usará su modelo predeterminado.`
                : detection?.confidence === 'ambiguous' && providerChoice === 'auto'
                  ? 'El prefijo no identifica al proveedor de forma única. Selecciona el proveedor correcto; DeepSeek y OpenAI pueden usar claves con el mismo formato.'
                  : apiKey.trim() && providerChoice === 'auto'
                    ? 'No se pudo identificar el proveedor por el formato de la clave. Selecciónalo manualmente.'
                  : 'Si el prefijo es compartido entre proveedores, selecciónalo manualmente para enviar la clave a la API correcta.'}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="type-label" style={{ color: 'var(--outline)' }}>
                API Key Secreta
              </label>
              {providerChoice !== 'auto' && (
                <span className="badge badge-verified" style={{ fontSize: '10px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>auto_awesome</span>
                  {providers.find(provider => provider.id === providerChoice).name} · {providers.find(provider => provider.id === providerChoice).model}
                </span>
              )}
            </div>
            <input
              id="input-key-secret"
              ref={apiKeyInputRef}
              type="password"
              className="form-input"
              placeholder="Pega la API Key del proveedor seleccionado..."
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              required
            />
            <span className="type-mono" style={{ fontSize: '11px', color: 'var(--outline)', display: 'block', marginTop: '4px' }}>
              {apiKey.trim() && providerChoice === 'auto' && detection?.confidence !== 'high'
                ? 'Selecciona el proveedor manualmente para esta clave.'
                : 'Guardarla no verifica la clave; puedes probar la conexión con el proveedor después.'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              id="btn-save-key"
              type="submit"
              disabled={isSubmitting || isDetecting || !apiKey.trim() || (providerChoice === 'auto' && detection?.confidence !== 'high')}
              className="btn btn-primary btn-sm"
            >
              {isSubmitting ? 'Guardando...' : isDetecting ? 'Detectando...' : providerChoice !== 'auto' ? `Guardar ${providers.find(provider => provider.id === providerChoice)?.name}` : detectedProvider ? `Guardar ${detectedProvider.name}` : 'Selecciona proveedor'}
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
              No tienes una conexión real configurada. Agrega una API Key válida para usar un modelo de IA; sin ella, el chat te indicará que no puede conectarse.
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
                        {k.isDecryptable === false && (
                          <span className="badge badge-warning">Requiere reemplazo</span>
                        )}
                      </div>
                      <div className="type-mono" style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                        Llave: <code>{k.maskedKey}</code> • Puesto: {k.role}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {k.isDecryptable === false ? (
                      <button
                        id={`btn-replace-key-${k.id}`}
                        onClick={() => handleReplaceKey(k)}
                        className="btn btn-primary btn-sm"
                      >
                        Reemplazar API Key
                      </button>
                    ) : (
                      <button
                        id={`btn-test-key-${k.id}`}
                        onClick={() => handleTestKey(k)}
                        disabled={testingKeyId !== null}
                        className="btn btn-ghost btn-sm"
                      >
                        {testingKeyId === k.id ? 'Probando...' : 'Probar conexión'}
                      </button>
                    )}
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
