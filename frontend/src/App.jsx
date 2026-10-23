import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatMessage from './components/Chat/ChatMessage';
import ChatInput from './components/Chat/ChatInput';
import HumanApprovalCard from './components/HumanApprovalCard';
import InspectionPanel from './components/InspectionPanel';
import KeysModal from './components/Modals/KeysModal';
import BudgetModal from './components/Modals/BudgetModal';
import ReceiptModal from './components/Modals/ReceiptModal';
import ScreenShareModal from './components/Modals/ScreenShareModal';
import SpecialistSkillsModal from './components/Modals/SpecialistSkillsModal';
import AutomaticAgentsModal from './components/Modals/AutomaticAgentsModal';
import { readApiResponse } from './utils/api';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [budget, setBudget] = useState(null);
  const [keys, setKeys] = useState([]);
  const [skills, setSkills] = useState([]);
  const [automaticAgentRoles, setAutomaticAgentRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [errorAlert, setErrorAlert] = useState(null);
  const [automaticStatus, setAutomaticStatus] = useState(null);

  // Estado del layout y modales
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedSpecialist, setSelectedSpecialist] = useState({
    id: 'directora',
    name: 'Directora'
  });
  const [isInspectionOpen, setIsInspectionOpen] = useState(true);
  const [isKeysOpen, setIsKeysOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [isAutomaticAgentsOpen, setIsAutomaticAgentsOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [activeReceiptId, setActiveReceiptId] = useState(null);

  // Último recibo y seguridad para el panel de "Confianza Visible"
  const [latestReceipt, setLatestReceipt] = useState(null);
  const [latestSecurity, setLatestSecurity] = useState(null);

  const messagesEndRef = useRef(null);
  const sessionId = 'session_principal';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Carga inicial de datos
  const loadInitialData = async () => {
    try {
      const budgetRes = await fetch('/api/budget');
      const budgetData = await budgetRes.json();
      if (budgetData.success) setBudget(budgetData.budget);

      const keysRes = await fetch('/api/keys');
      const keysData = await keysRes.json();
      if (keysData.success) setKeys(keysData.keys);

      try {
        const skillsRes = await fetch('/api/skills');
        const skillsData = await readApiResponse(skillsRes, '/api/skills');
        if (skillsData.success) setSkills(skillsData.skills);
      } catch (error) {
        console.error('No se pudieron cargar las skills:', error);
      }

      const automaticAgentsRes = await fetch('/api/agents/automatic');
      const automaticAgentsData = await readApiResponse(automaticAgentsRes, '/api/agents/automatic');
      if (automaticAgentsData.success) setAutomaticAgentRoles(automaticAgentsData.enabledRoles);

      const chatRes = await fetch(`/api/chat/history?sessionId=${sessionId}`);
      const chatData = await chatRes.json();
      if (chatData.success && chatData.messages) {
        setMessages(chatData.messages);
        if (chatData.messages.length > 0) {
          const lastMsg = chatData.messages[chatData.messages.length - 1];
          if (lastMsg.receiptId) {
            fetch(`/api/chat/receipt/${lastMsg.receiptId}`)
              .then(r => r.json())
              .then(d => { if (d.success) setLatestReceipt(d.receipt); });
          }
        }
      }
    } catch (err) {
      console.error('Error al inicializar la app:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleClearHistory = async () => {
    const confirmed = window.confirm(
      '¿Borrar todo el historial del chat de esta sesión?\n\n' +
      'Se quitarán los mensajes de la conversación. Se conservarán las API Keys, skills, presupuestos, configuración de agentes, recibos y registros de uso.'
    );
    if (!confirmed) return;

    setIsClearingHistory(true);
    setErrorAlert(null);
    try {
      const response = await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await readApiResponse(response, '/api/chat/clear');
      if (!data.success) {
        throw new Error(data.error || 'El servidor no confirmó el borrado del historial.');
      }
      setMessages([]);
      setLatestReceipt(null);
      setLatestSecurity(null);
      setAutomaticStatus(null);
      setActiveReceiptId(null);
    } catch (error) {
      setErrorAlert(`No se pudo borrar el historial: ${error.message}`);
    } finally {
      setIsClearingHistory(false);
    }
  };

  // Envío de mensaje a través de la tubería de 4 pasos
  const handleSendMessage = async (promptText, document = null) => {
    setErrorAlert(null);
    setAutomaticStatus(null);
    setIsLoading(true);

    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      sender: 'user',
      content: document
        ? `${promptText}\n\n📎 Documento adjunto: ${document.fileName}`
        : promptText,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          prompt: promptText,
          document,
          role: selectedSpecialist.id,
          specialistName: selectedSpecialist.name
        })
      });

      const data = await response.json();

      if (response.status === 429 || data.blocked) {
        setErrorAlert(data.reason || 'Llamada bloqueada por la puerta de seguridad del pipeline.');
        return null;
      }

      if (data.success) {
        setAutomaticStatus(data.automaticStatus || null);
        const assistantMsg = {
          id: data.messageId,
          sender: 'assistant',
          specialist: data.specialistName,
          specialistBadge: data.role.toUpperCase(),
          content: data.content,
          receiptId: data.receipt?.id,
          codeReviewed: Boolean(data.security?.codeReviewed),
          criticReview: data.criticReview,
          isFallbackUsed: Boolean(data.isFallbackUsed),
          createdAt: new Date().toISOString(),
          receiptSummary: {
            model: data.receipt?.model,
            tokens: data.receipt?.totalTokens,
            costUsd: data.receipt?.costUsd
          }
        };

        setMessages(prev => [...prev, assistantMsg]);
        const automaticMessages = (data.automaticResponses || []).map(message => ({
          ...message,
          sender: 'assistant',
          specialistBadge: message.role.toUpperCase(),
          createdAt: message.createdAt || new Date().toISOString()
        }));
        if (automaticMessages.length) {
          setMessages(prev => [...prev, ...automaticMessages]);
        }

        const interventionWarnings = (data.automaticInterventionErrors || [])
          .map(item => `${item.specialistName}: ${item.error}`);

        if (data.receipt) {
          setLatestReceipt({
            id: data.receipt.id,
            timestamp: data.receipt.timestamp,
            model: data.receipt.model,
            totalTokens: data.receipt.totalTokens,
            costUsd: data.receipt.costUsd,
            inputHash: data.receipt.inputHash,
            outputHash: data.receipt.outputHash,
            signature: data.receipt.signature
          });
          // Consultar comprobante completo para hashes si no vinieron directos
          fetch(`/api/chat/receipt/${data.receipt.id}`)
            .then(r => r.json())
            .then(d => { if (d.success) setLatestReceipt(d.receipt); });
        }

        if (data.security) {
          setLatestSecurity(data.security);
        }

        if (data.budget) {
          setBudget(data.budget);
        }

        const notices = [data.budgetAlert, ...interventionWarnings].filter(Boolean);
        if (notices.length) {
          setErrorAlert(notices.join(' | '));
        }
        return data.content;
      } else {
        setErrorAlert(data.error || 'Ocurrió un error al procesar la respuesta.');
        return null;
      }
    } catch (err) {
      setErrorAlert('Error de conexión con el backend: ' + err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeakResponse = (text) => new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
      resolve(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(
      text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_#`>]/g, ' ').slice(0, 5000)
    );
    utterance.lang = 'es-CR';
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });

  // Guardar llave BYOK
  const handleSaveKey = async (keyPayload) => {
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keyPayload)
      });
      const data = await res.json();
      if (data.success) {
        const keysRes = await fetch('/api/keys');
        const keysData = await keysRes.json();
        if (keysData.success) setKeys(keysData.keys);
        return { success: true, provider: data.providerName || data.key?.provider };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleTestKey = async (keyId) => {
    try {
      const res = await fetch(`/api/keys/${keyId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      return data.success
        ? { success: true, provider: data.provider, model: data.model }
        : { success: false, error: data.error || 'No se pudo validar la conexión.' };
    } catch (err) {
      return { success: false, error: `Error de conexión con el backend: ${err.message}` };
    }
  };

  const handleSaveSkill = async (skillPayload) => {
    try {
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillPayload)
      });
      const data = await readApiResponse(response, '/api/skills');
      if (!data.success || !data.skill) {
        return { success: false, error: 'El backend no confirmó el guardado de la skill.' };
      }
      setSkills(previous => [...previous, data.skill]);
      return { success: true };
    } catch (error) {
      return { success: false, error: `Error de conexión con el backend: ${error.message}` };
    }
  };

  const handleDeleteSkill = async (skillId) => {
    try {
      const response = await fetch(`/api/skills/${skillId}`, { method: 'DELETE' });
      const data = await readApiResponse(response, `/api/skills/${skillId}`);
      if (!data.success) {
        return { success: false, error: 'El backend no confirmó la eliminación de la skill.' };
      }
      setSkills(previous => previous.filter(skill => skill.id !== skillId));
      return { success: true };
    } catch (error) {
      return { success: false, error: `Error de conexión con el backend: ${error.message}` };
    }
  };

  const handleSaveAutomaticAgents = async (enabledRoles) => {
    try {
      const response = await fetch('/api/agents/automatic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledRoles })
      });
      const data = await readApiResponse(response, '/api/agents/automatic');
      if (!data.success) {
        return { success: false, error: 'El backend no confirmó la configuración de agentes.' };
      }
      setAutomaticAgentRoles(data.enabledRoles);
      return { success: true };
    } catch (error) {
      return { success: false, error: `Error al guardar los agentes: ${error.message}` };
    }
  };

  // Eliminar llave BYOK
  const handleDeleteKey = async (keyId) => {
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setKeys(prev => prev.filter(k => k.id !== keyId));
      }
    } catch (err) {
      console.error('Error al eliminar llave:', err);
    }
  };

  // Actualizar presupuesto
  const handleUpdateBudget = async (budgetSettings) => {
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetSettings)
      });
      const data = await res.json();
      if (data.success) {
        const budgetRes = await fetch('/api/budget');
        const bData = await budgetRes.json();
        if (bData.success) setBudget(bData.budget);
      }
    } catch (err) {
      console.error('Error al actualizar presupuesto:', err);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--background)' }}>
      {/* 1. Zona Izquierda: Navegación y Especialistas (260px) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenKeys={() => setIsKeysOpen(true)}
        onOpenSkills={() => setIsSkillsOpen(true)}
        onOpenAutomaticAgents={() => setIsAutomaticAgentsOpen(true)}
        onOpenBudget={() => setIsBudgetOpen(true)}
        onClearHistory={handleClearHistory}
        isClearingHistory={isClearingHistory}
        selectedSpecialist={selectedSpecialist}
        onSelectSpecialist={(specialist) => {
          setSelectedSpecialist(specialist);
          setActiveTab('chat');
        }}
      />

      {/* 2. Zona Central: Barra Superior y Chat Orquestado (máximo 880px) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        
        {/* Indicador de pantalla compartida si está activa (rojo fijo según design.md) */}
        {isSharingScreen && (
          <div style={{
            height: '32px',
            backgroundColor: 'var(--error-strong)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--spacing-md)',
            fontSize: '12px',
            fontWeight: 600
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>screen_share</span>
              <span>Compartiendo pantalla con consentimiento previo (Ley 8968)</span>
            </div>
            <button
              onClick={() => setIsSharingScreen(false)}
              className="btn btn-sm"
              style={{ height: '22px', backgroundColor: 'rgba(0, 0, 0, 0.4)', color: '#ffffff', padding: '0 8px' }}
            >
              Detener
            </button>
          </div>
        )}

        {/* Barra Superior Fija */}
        <Header
          budget={budget}
          specialistName={selectedSpecialist.name}
          onOpenKeys={() => setIsKeysOpen(true)}
          onOpenBudget={() => setIsBudgetOpen(true)}
          onOpenScreenShare={() => setIsScreenShareOpen(true)}
          isInspectionOpen={isInspectionOpen}
          onToggleInspection={() => setIsInspectionOpen(!isInspectionOpen)}
          keysCount={keys.length}
        />

        {/* Área de mensajes de chat */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--spacing-md)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', maxWidth: '880px' }}>
            {messages.length === 0 ? (
              <div style={{
                margin: '40px auto',
                textAlign: 'center',
                padding: 'var(--spacing-xl)',
                backgroundColor: 'var(--surface-low)',
                border: '1px solid var(--outline-variant-40)',
                borderRadius: 'var(--rounded-lg)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--rounded-lg)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--on-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--spacing-md) auto'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>school</span>
                </div>
                <h2 className="type-headline-md" style={{ marginBottom: '8px' }}>
                  Ecosistema IA — Swarm Enterprise
                </h2>
                <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', maxWidth: '580px', margin: '0 auto var(--spacing-lg) auto' }}>
                  Una Directora orquestadora y sus maestras especialistas coordinadas en un único chat con control estricto de presupuesto, escaneo VibeScan y recibos firmados inmutables.
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                  textAlign: 'left'
                }}>
                  <div className="surface-level-2" style={{ padding: '12px' }}>
                    <span className="type-overline" style={{ color: 'var(--secondary)' }}>1. Costos</span>
                    <p style={{ fontSize: '11px', color: 'var(--outline)', margin: '4px 0 0 0' }}>Tope y token-limiter</p>
                  </div>
                  <div className="surface-level-2" style={{ padding: '12px' }}>
                    <span className="type-overline" style={{ color: 'var(--primary-soft)' }}>2. IA Trabaja</span>
                    <p style={{ fontSize: '11px', color: 'var(--outline)', margin: '4px 0 0 0' }}>Especialistas + Fallback</p>
                  </div>
                  <div className="surface-level-2" style={{ padding: '12px' }}>
                    <span className="type-overline" style={{ color: 'var(--secondary)' }}>3. Seguridad</span>
                    <p style={{ fontSize: '11px', color: 'var(--outline)', margin: '4px 0 0 0' }}>VibeScan de código</p>
                  </div>
                  <div className="surface-level-2" style={{ padding: '12px' }}>
                    <span className="type-overline" style={{ color: 'var(--warning)' }}>4. Recibo</span>
                    <p style={{ fontSize: '11px', color: 'var(--outline)', margin: '4px 0 0 0' }}>Firma criptográfica</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onOpenReceipt={(recId) => setActiveReceiptId(recId)}
                  />
                ))}

                {/* Demostración interactiva de Aprobación Humana (El humano manda) */}
                {messages.length > 2 && (
                  <HumanApprovalCard
                    actionTitle="Notificación vía n8n"
                    actionDescription="El Asistente de acciones solicita tu aprobación para registrar el resumen en la hoja de auditoría corporativa."
                    details={[
                      { label: 'Destino', value: 'Google Sheets / n8n' },
                      { label: 'Costo', value: '$0,0002 USD' },
                      { label: 'Aprobación', value: 'Requerida' }
                    ]}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* Command Dock fijo en la parte inferior */}
        <ChatInput
          onSendMessage={handleSendMessage}
          onVoiceSendMessage={handleSendMessage}
          onSpeakResponse={handleSpeakResponse}
          isLoading={isLoading}
          errorAlert={errorAlert}
          automaticStatus={automaticStatus}
          specialistName={selectedSpecialist.name}
        />
      </div>

      {/* 3. Zona Derecha: Panel de Inspección (360px colapsable) */}
      <InspectionPanel
        isOpen={isInspectionOpen}
        onClose={() => setIsInspectionOpen(false)}
        latestReceipt={latestReceipt}
        budget={budget}
        latestSecurity={latestSecurity}
      />

      {/* Modales */}
      <KeysModal
        isOpen={isKeysOpen}
        onClose={() => setIsKeysOpen(false)}
        keys={keys}
        onSaveKey={handleSaveKey}
        onTestKey={handleTestKey}
        onDeleteKey={handleDeleteKey}
      />

      <SpecialistSkillsModal
        key={isSkillsOpen ? `skills:${selectedSpecialist.id}` : 'skills:closed'}
        isOpen={isSkillsOpen}
        onClose={() => setIsSkillsOpen(false)}
        selectedSpecialist={selectedSpecialist}
        skills={skills}
        onSaveSkill={handleSaveSkill}
        onDeleteSkill={handleDeleteSkill}
      />
      <AutomaticAgentsModal
        key={isAutomaticAgentsOpen ? `automatic-agents:${automaticAgentRoles.join(',')}` : 'automatic-agents:closed'}
        isOpen={isAutomaticAgentsOpen}
        enabledRoles={automaticAgentRoles}
        onSave={handleSaveAutomaticAgents}
        onClose={() => setIsAutomaticAgentsOpen(false)}
      />

      <BudgetModal
        isOpen={isBudgetOpen}
        onClose={() => setIsBudgetOpen(false)}
        budget={budget}
        onUpdateBudget={handleUpdateBudget}
      />

      <ReceiptModal
        isOpen={Boolean(activeReceiptId)}
        receiptId={activeReceiptId}
        onClose={() => setActiveReceiptId(null)}
      />

      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
        onConfirmShare={() => setIsSharingScreen(true)}
      />
    </div>
  );
}
