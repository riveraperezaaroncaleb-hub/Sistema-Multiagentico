function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function criteriaLine(rubric) {
  const criteria = rubric?.criteria || [];
  return criteria.map(item => `${item.id}: ${oneLine(item.descripcion)}`).join(' | ');
}

function buildPrompt({ task, tipo, schema, rubric }) {
  const lines = [
    'Genera la solución completa para la tarea.',
    `TIPO: ${tipo}`,
    `TAREA: ${oneLine(task)}`,
    tipo === 'codigo'
      ? 'SALIDA: solo un bloque ```js con CommonJS (module.exports), sin explicación.'
      : 'SALIDA: solo JSON válido, sin texto adicional.',
    schema ? `SCHEMA: ${oneLine(JSON.stringify(schema))}` : '',
    rubric ? `CRITERIOS: ${criteriaLine(rubric)}` : '',
    'No inventes requisitos ni agregues cercas adicionales.'
  ].filter(Boolean);
  return lines.slice(0, 15).join('\n');
}

function extractCode(content) {
  const text = String(content || '');
  const fences = [...text.matchAll(/```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/gi)];
  if (fences.length) {
    const code = fences.map(match => match[1]).sort((a, b) => b.length - a.length)[0].trim();
    if (code) return code;
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line =>
    /^\s*(module\.exports|exports\.|const |let |var |function |async function|class |\/\/|\/\*)/.test(line)
  );
  const code = (start > 0 ? lines.slice(start) : lines).join('\n').trim();
  if (!code) throw Object.assign(new Error('El generador no devolvió código.'), { code: 'PARSE' });
  return code;
}

function cleanJson(content) {
  return String(content || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseJson(content) {
  const cleaned = cleanJson(content);
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
    throw Object.assign(new Error('El generador no devolvió JSON válido.'), { code: 'PARSE', cause: firstError });
  }
}

function parse({ content, tipo }) {
  if (tipo === 'codigo') return { code: extractCode(content), parsed: null };
  const parsed = parseJson(content);
  return { code: null, parsed, content: JSON.stringify(parsed) };
}

module.exports = { buildPrompt, parse, extractCode, parseJson };
