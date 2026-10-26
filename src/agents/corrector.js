const generador = require('./generador');

function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function criteriaLine(rubric) {
  return (rubric?.criteria || []).map(item => `${item.id}: ${oneLine(item.descripcion)}`).join(' | ');
}

function factsLine(facts) {
  return (facts || [])
    .map(fact => `${fact.id}=${fact.status || (fact.ok ? 'cumple' : 'no cumple')} (${oneLine(fact.detalle || '').slice(0, 160)})`)
    .join(' | ');
}

function buildPrompt({ task, output, rubric, facts, failingIds, rejectedIds }) {
  const lines = [
    'Corrige la salida para cumplir los criterios fallidos.',
    `TAREA: ${oneLine(task)}`,
    `CRITERIOS: ${criteriaLine(rubric)}`,
    `FALLIDOS: ${(failingIds || []).join(', ') || 'ninguno'}`,
    `HECHOS: ${factsLine(facts) || 'ninguno'}`,
    `RECHAZADOS_PREVIOS: ${(rejectedIds || []).join(', ') || 'ninguno'}`,
    `SALIDA_ACTUAL: ${JSON.stringify(String(output || ''))}`,
    'Puedes rechazar como máximo 1 criterio no verificado por código y no repetir rechazos.',
    'No puedes rechazar criterios verificados por código.',
    'Devuelve SOLO JSON: {"salida":"contenido completo","rechazados":["id"]}.'
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
    throw Object.assign(new Error('El corrector no devolvió JSON válido.'), { code: 'PARSE', cause: firstError });
  }
}

function parse(content, { tipo }) {
  const data = parseJson(content);
  if (typeof data.salida !== 'string' || !data.salida.trim()) {
    throw Object.assign(new Error('El corrector no devolvió salida.'), { code: 'PARSE' });
  }
  const corrected = generador.parse({ content: data.salida, tipo });
  return {
    content: tipo === 'codigo' ? corrected.code : corrected.content,
    parsed: corrected.parsed ?? null,
    rechazados: Array.isArray(data.rechazados)
      ? [...new Set(data.rechazados.filter(item => typeof item === 'string'))]
      : []
  };
}

module.exports = { buildPrompt, parse, parseJson };
