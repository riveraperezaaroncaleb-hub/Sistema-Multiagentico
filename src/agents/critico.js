function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function criteriaLine(rubric) {
  return (rubric?.criteria || []).map(item => `${item.id}: ${oneLine(item.descripcion)}`).join(' | ');
}

function factsLine(facts) {
  return (facts || [])
    .map(fact => {
      const state = fact.status || (fact.ok ? 'cumple' : 'no cumple');
      const detail = oneLine(fact.detalle || '').slice(0, 200);
      return `${fact.id}=${state}${detail ? ` (${detail})` : ''}`;
    })
    .join(' | ');
}

function buildPrompt({ task, output, rubric, facts }) {
  const lines = [
    'Evalúa la salida contra la tarea y la rúbrica fija.',
    `TAREA: ${oneLine(task)}`,
    `CRITERIOS: ${criteriaLine(rubric)}`,
    `HECHOS DE VERIFICADORES: ${factsLine(facts) || 'ninguno'}`,
    `SALIDA: ${JSON.stringify(String(output || ''))}`,
    'No contradigas los hechos verificados por código ni inventes criterios.',
    'Devuelve SOLO JSON: {"aprobado":boolean,"criterios":[{"id":"...","cumple":boolean,"evidencia":"..."}],"motivo":"..."}',
    'Incluye exactamente todos los ids de la rúbrica, una sola vez.'
  ];
  return lines.slice(0, 15).join('\n');
}

function parseJson(content) {
  const cleaned = String(content || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
      }
    }
    throw Object.assign(new Error('El crítico no devolvió JSON válido.'), { code: 'PARSE', cause: firstError });
  }
}

function parse(content, rubric) {
  const data = parseJson(content);
  const byId = new Map();
  for (const item of Array.isArray(data.criterios) ? data.criterios : []) {
    if (!item || typeof item.id !== 'string') continue;
    if (byId.has(item.id)) continue;
    byId.set(item.id, {
      id: item.id,
      cumple: item.cumple === true,
      evidencia: typeof item.evidencia === 'string' ? item.evidencia.slice(0, 500) : ''
    });
  }
  const criterios = (rubric?.criteria || []).map(item => {
    const found = byId.get(item.id);
    return {
      id: item.id,
      cumple: found ? found.cumple : false,
      evidencia: found ? found.evidencia : 'omitido por el crítico'
    };
  });
  return {
    aprobado: data.aprobado === true,
    criterios,
    motivo: typeof data.motivo === 'string' ? data.motivo.slice(0, 500) : ''
  };
}

module.exports = { buildPrompt, parse, parseJson };
