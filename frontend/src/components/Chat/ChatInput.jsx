import React, { useState, useRef, useEffect } from 'react';

const STARTER_PROMPTS = [
  'Escribe una función en TypeScript para verificar si un string es palíndromo',
  'Redacta un correo solicitando extensión de 3 días con tono empático',
  'Investiga las 3 diferencias clave entre arquitecturas monolíticas y microservicios'
];

export default function ChatInput({
  onSendMessage,
  onVoiceSendMessage,
  onSpeakResponse,
  isLoading,
  errorAlert,
  automaticStatus,
  specialistName = 'Directora'
}) {
  const [prompt, setPrompt] = useState('');
  const [activeSkill, setActiveSkill] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [attachedDocument, setAttachedDocument] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const promptRef = useRef(prompt);
  const silenceTimerRef = useRef(null);
  const shouldSubmitVoiceRef = useRef(false);
  const isVoiceSubmissionPendingRef = useRef(false);
  const hasFinalVoiceResultRef = useRef(false);
  const voiceErrorRef = useRef(false);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  // Estimación aproximada de tokens para el contador mono
  const estimatedTokens = Math.max(0, Math.round((prompt.length + (attachedDocument?.text.length || 0)) / 4));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [prompt]);

  useEffect(() => () => {
    window.clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
  }, []);

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setDocumentStatus('Solo se aceptan documentos .docx de Microsoft Word.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocumentStatus('El documento supera el límite de 10 MB.');
      return;
    }

    setIsUploadingDocument(true);
    setDocumentStatus('');
    try {
      const formData = new FormData();
      formData.append('document', file);
      const response = await fetch('/api/chat/document/extract', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'No se pudo leer el documento.');
      }
      setAttachedDocument(data.document);
      setDocumentStatus(data.document.truncated
        ? 'Documento listo. El texto se limitó a 20 000 caracteres para el análisis.'
        : `Documento listo: ${data.document.extractedCharacters.toLocaleString()} caracteres extraídos.`);
    } catch (error) {
      setDocumentStatus(`No se pudo adjuntar el documento: ${error.message}`);
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const toggleMicrophone = async () => {
    if (isListening) {
      shouldSubmitVoiceRef.current = true;
      setVoiceStatus('Enviando lo que dijiste...');
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus('Tu navegador no admite dictado por voz. Prueba con Chrome o Edge.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus('No se puede acceder al micrófono desde este navegador. Usa Chrome o Edge en localhost o una conexión segura (HTTPS).');
      return;
    }

    let microphoneStream;
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setVoiceStatus('El acceso al micrófono está bloqueado. Actívalo en el candado de la barra del navegador > Permisos del sitio > Micrófono y vuelve a pulsar el botón.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setVoiceStatus('No se encontró un micrófono. Conecta uno y revisa que Windows lo tenga habilitado.');
      } else {
        setVoiceStatus(`No se pudo abrir el micrófono: ${error.message || error.name}`);
      }
      return;
    }
    microphoneStream.getTracks().forEach(track => track.stop());

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CR';
    recognition.continuous = true;
    recognition.interimResults = true;
    finalTranscriptRef.current = promptRef.current.trim();
    hasFinalVoiceResultRef.current = false;
    voiceErrorRef.current = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus('Micrófono activo. Habla; enviaré el mensaje cuando termines.');
    };
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = finalTranscriptRef.current;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          const finalText = transcript.trim();
          if (finalText) {
            finalTranscript = `${finalTranscript}${finalTranscript ? ' ' : ''}${finalText}`;
            hasFinalVoiceResultRef.current = true;
          }
        } else {
          interimTranscript += transcript;
        }
      }

      finalTranscriptRef.current = finalTranscript;
      setPrompt([finalTranscript, interimTranscript.trim()].filter(Boolean).join(' '));
      if (hasFinalVoiceResultRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = window.setTimeout(() => {
          shouldSubmitVoiceRef.current = true;
          setVoiceStatus('Pausa detectada. Enviando tu mensaje...');
          recognition.stop();
        }, 1600);
      }
    };
    recognition.onerror = (event) => {
      voiceErrorRef.current = true;
      const messages = {
        'not-allowed': 'El navegador bloqueó el micrófono. Activa su permiso en la configuración del sitio y vuelve a intentarlo.',
        'service-not-allowed': 'El navegador no permite el servicio de reconocimiento de voz.',
        'audio-capture': 'No se encontró un micrófono disponible.',
        'no-speech': 'No se detectó voz. Inténtalo de nuevo.',
        network: 'Falló el reconocimiento de voz por un problema de conexión.'
      };
      setVoiceStatus(messages[event.error] || 'No se pudo iniciar el reconocimiento de voz.');
    };
    recognition.onend = () => {
      setIsListening(false);
      setPrompt(finalTranscriptRef.current);
      recognitionRef.current = null;
      if (!shouldSubmitVoiceRef.current && hasFinalVoiceResultRef.current) {
        shouldSubmitVoiceRef.current = true;
      }
      window.clearTimeout(silenceTimerRef.current);
      if (shouldSubmitVoiceRef.current && hasFinalVoiceResultRef.current && !isVoiceSubmissionPendingRef.current) {
        const transcript = finalTranscriptRef.current.trim();
        shouldSubmitVoiceRef.current = false;
        if (transcript && onVoiceSendMessage) {
          isVoiceSubmissionPendingRef.current = true;
          setPrompt('');
          finalTranscriptRef.current = '';
          setVoiceStatus('Enviando el mensaje y esperando la respuesta...');
          Promise.resolve(onVoiceSendMessage(transcript, attachedDocument))
            .then(async (reply) => {
              if (!reply) {
                setVoiceStatus('No se recibió una respuesta para reproducir.');
                return;
              }
              setVoiceStatus('La IA está hablando...');
              const spoke = await onSpeakResponse?.(reply);
              setVoiceStatus(spoke
                ? 'Respuesta por voz terminada. Pulsa el micrófono para continuar.'
                : 'No se pudo reproducir la respuesta. Tu navegador quizá no admite voz sintetizada.');
            })
            .catch((error) => setVoiceStatus(`No se pudo completar la conversación por voz: ${error.message}`))
            .finally(() => {
              isVoiceSubmissionPendingRef.current = false;
              setAttachedDocument(null);
              setDocumentStatus('');
            });
        } else {
          setVoiceStatus('No se detectó voz para enviar. Pulsa el micrófono e inténtalo de nuevo.');
        }
      } else if (!voiceErrorRef.current && !hasFinalVoiceResultRef.current) {
        setVoiceStatus('No se detectó voz. Comprueba el micrófono e inténtalo otra vez.');
      }
    };

    recognitionRef.current = recognition;
    shouldSubmitVoiceRef.current = false;
    setVoiceStatus('');
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setVoiceStatus(error.message || 'No se pudo iniciar el micrófono. Espera un momento e inténtalo de nuevo.');
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    recognitionRef.current?.stop();
    onSendMessage(prompt.trim(), attachedDocument);
    setPrompt('');
    setAttachedDocument(null);
    setDocumentStatus('');
    finalTranscriptRef.current = '';
    setVoiceStatus('');
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
      {automaticStatus && (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: 'rgba(78, 222, 163, 0.1)',
            border: '1px solid rgba(78, 222, 163, 0.45)',
            borderRadius: 'var(--rounded-md)',
            padding: '8px 12px',
            marginBottom: '10px',
            color: 'var(--secondary)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>forum</span>
          {automaticStatus.enabledCount === 0
            ? 'No hay IAs automáticas activas para este turno.'
            : `${automaticStatus.evaluatedCount} de ${automaticStatus.enabledCount} IAs activas revisaron el chat; ${automaticStatus.responseCount} intervinieron automáticamente.`}
        </div>
      )}
      {voiceStatus && (
        <div
          role="status"
          aria-live="polite"
          style={{
            color: isListening ? 'var(--secondary)' : 'var(--outline)',
            fontSize: '12px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {isListening ? 'graphic_eq' : 'info'}
          </span>
          {voiceStatus}
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingDocument || isLoading}
            className="btn btn-ghost btn-sm"
            style={{ width: '32px', padding: 0, color: 'var(--outline)' }}
            title="Adjuntar documento DOCX"
            aria-label="Adjuntar documento DOCX"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>attach_file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={uploadDocument}
            style={{ display: 'none' }}
          />

          {/* Campo de texto */}
          <textarea
            id="chat-input-textarea"
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Pregunta o da una instrucción a ${specialistName}...`}
            disabled={isLoading || isUploadingDocument}
            className="command-dock-input"
          />

          <button
            id="btn-toggle-microphone"
            type="button"
            onClick={toggleMicrophone}
            disabled={isLoading || isUploadingDocument}
            className={`btn ${isListening ? 'btn-primary agent-active-glow' : 'btn-ghost'}`}
            style={{
              width: '36px',
              minWidth: '36px',
              height: '36px',
              minHeight: '36px',
              padding: 0,
              color: isListening ? 'var(--on-primary)' : 'var(--outline)'
            }}
            aria-label={isListening ? 'Enviar lo dicho y detener el micrófono' : 'Hablar con la IA'}
            aria-pressed={isListening}
            title={isListening ? 'Detener micrófono' : 'Hablar con la IA'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {isListening ? 'mic_off' : 'mic'}
            </span>
          </button>

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

        {(attachedDocument || isUploadingDocument || documentStatus) && (
          <div role="status" aria-live="polite" style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--outline)' }}>
            {isUploadingDocument ? 'Subiendo y leyendo el documento en este servidor...' : documentStatus}
            {attachedDocument && !isUploadingDocument && (
              <button
                type="button"
                onClick={() => { setAttachedDocument(null); setDocumentStatus(''); }}
                aria-label="Quitar documento adjunto"
                title="Quitar documento"
                style={{ marginLeft: '8px', border: 0, background: 'none', color: 'var(--error)', cursor: 'pointer' }}
              >
                {attachedDocument.fileName} ×
              </button>
            )}
          </div>
        )}

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
