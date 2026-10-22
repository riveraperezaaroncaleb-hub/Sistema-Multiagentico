/**
 * PASO 3 OBLIGATORIO: Seguridad (VibeScan-AI)
 * Inspecciona y analiza el código generado por IA para evitar secretos filtrados,
 * fallos típicos, inyecciones de código o patrones peligrosos.
 */

// Expresiones regulares para detectar fugas de credenciales
const SECRET_PATTERNS = [
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9_-]{20,}/g },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36,}/g },
  { name: 'AWS Access Key', regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g },
  { name: 'Password / Secret en duro', regex: /(?:password|secret|api_key|token)\s*[:=]\s*["']([^"']{8,})["']/gi }
];

// Expresiones para detectar código peligroso o antipatrones típicos de IA
const DANGEROUS_PATTERNS = [
  { name: 'Uso peligroso de eval()', regex: /\beval\s*\(/g, risk: 'ALTO' },
  { name: 'Ejecución de shell insegura', regex: /exec\s*\(|child_process\.exec|shell_exec/g, risk: 'ALTO' },
  { name: 'Peligro XSS vía innerHTML', regex: /\.innerHTML\s*=/g, risk: 'MEDIO' },
  { name: 'Descarga y ejecución remota (curl | bash)', regex: /curl\s+.*\|\s*(?:bash|sh)/g, risk: 'CRITICO' },
  { name: 'Inyección SQL por concatenación directa', regex: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*["']\s*\+\s*[a-zA-Z0-9_]+/gi, risk: 'ALTO' }
];

/**
 * Escanea el texto generado por la IA en busca de bloques de código y vulnerabilidades.
 */
function scanContent(content) {
  if (!content || typeof content !== 'string') {
    return {
      hasCode: false,
      codeReviewed: false,
      content,
      findings: []
    };
  }

  // Detectar si el texto contiene bloques de código Markdown
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  const codeMatches = [...content.matchAll(codeBlockRegex)];
  const hasCode = codeMatches.length > 0;

  if (!hasCode) {
    return {
      hasCode: false,
      codeReviewed: false,
      content,
      findings: [],
      badge: null
    };
  }

  let sanitizedContent = content;
  const findings = [];

  // 1. Escanear fugas de secretos y neutralizarlos
  SECRET_PATTERNS.forEach(rule => {
    let match;
    while ((match = rule.regex.exec(content)) !== null) {
      findings.push({
        type: 'SECRET_LEAK',
        rule: rule.name,
        risk: 'CRITICO',
        details: `Se detectó posible credencial expuesta (${rule.name}). Ha sido ofuscada automáticamente.`
      });
      // Neutralizar el secreto expuesto
      sanitizedContent = sanitizedContent.replace(match[0], '••••[SECRET_OBLITERATED_BY_VIBESCAN]••••');
    }
  });

  // 2. Escanear antipatrones y código riesgoso
  codeMatches.forEach((codeMatch, index) => {
    const codeBody = codeMatch[2];
    DANGEROUS_PATTERNS.forEach(danger => {
      if (danger.regex.test(codeBody)) {
        findings.push({
          type: 'UNSAFE_PATTERN',
          rule: danger.name,
          risk: danger.risk,
          blockIndex: index + 1,
          details: `Patrón riesgoso detectado en bloque #${index + 1}: ${danger.name} (Riesgo ${danger.risk}).`
        });
      }
    });
  });

  const isSafe = findings.filter(f => f.risk === 'CRITICO').length === 0;

  return {
    hasCode: true,
    codeReviewed: true,
    isSafe,
    findings,
    badge: 'Código revisado ✓',
    content: sanitizedContent,
    summary: findings.length === 0
      ? 'Análisis VibeScan completado: 0 vulnerabilidades detectadas.'
      : `Análisis VibeScan: ${findings.length} observación(es) identificada(s).`
  };
}

module.exports = {
  scanContent,
  SECRET_PATTERNS,
  DANGEROUS_PATTERNS
};
