import React, { useState, useEffect } from 'react';

export default function BudgetModal({ isOpen, onClose, budget, onUpdateBudget }) {
  const [dailyLimit, setDailyLimit] = useState(1.0);
  const [monthlyLimit, setMonthlyLimit] = useState(25.0);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    if (budget) {
      setDailyLimit(budget.dailyLimit || 1.0);
      setMonthlyLimit(budget.monthlyLimit || 25.0);
      setAlertThreshold(budget.alertThresholdPct || 80);
    }
  }, [budget]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onUpdateBudget({
      dailyLimitUsd: Number(dailyLimit),
      monthlyLimitUsd: Number(monthlyLimit),
      alertThresholdPct: Number(alertThreshold)
    });
    setIsSubmitting(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        id="modal-budget" 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '18px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px'
        }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>
              💰 Control de Presupuesto (Token-Limiter)
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Paso 1 del pipeline: Protección de gasto y corte automático ante sobrecostos.
            </p>
          </div>
          <button 
            id="btn-close-budget-modal"
            onClick={onClose} 
            className="btn btn-secondary btn-sm"
          >
            ✕
          </button>
        </div>

        {/* Resumen de consumo actual */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '18px'
        }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px'
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gasto de Hoy</span>
            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-cyan)' }}>
              ${(budget?.dailySpent || 0).toFixed(4)}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {(budget?.dailyTokens || 0).toLocaleString()} tokens consumidos
            </span>
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px'
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gasto del Mes</span>
            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-indigo)' }}>
              ${(budget?.monthlySpent || 0).toFixed(4)}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Límite: ${budget?.monthlyLimit?.toFixed(2)}
            </span>
          </div>
        </div>

        {savedFeedback && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '14px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#6ee7b7',
            fontSize: '0.8rem'
          }}>
            ✓ Límites de presupuesto actualizados en SQLite.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Tope Diario Máximo (USD $)</label>
            <input
              id="input-daily-limit"
              type="number"
              step="0.01"
              min="0.01"
              max="500"
              className="form-input"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Si el consumo diario llega a este monto, las IAs rechazarán llamadas para no generar deuda.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Tope Mensual Máximo (USD $)</label>
            <input
              id="input-monthly-limit"
              type="number"
              step="0.10"
              min="0.10"
              max="2000"
              className="form-input"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Umbral de Alerta Preventiva (%)</label>
            <input
              id="input-alert-threshold"
              type="number"
              min="20"
              max="95"
              className="form-input"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Muestra advertencia en el chat cuando el gasto alcance este porcentaje (ej. 80%).
            </span>
          </div>

          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.76rem',
            color: '#a5f3fc',
            marginBottom: '16px'
          }}>
            🛡️ <strong>Detector de Bucles Activo:</strong> Cualquier secuencia de 3 peticiones repetidas idénticas se corta de inmediato para proteger tus fondos.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancelar
            </button>
            <button 
              id="btn-save-budget"
              type="submit" 
              disabled={isSubmitting} 
              className="btn btn-primary"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
