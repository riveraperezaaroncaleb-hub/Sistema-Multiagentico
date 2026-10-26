function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeOf(value) === type;
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateSchema(schema, value, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { ok: true, errors };

  if (Array.isArray(schema.enum) && !schema.enum.some(item => equalJson(item, value))) {
    errors.push(`${path}: no está en enum`);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => matchesType(value, type))) {
      errors.push(`${path}: se esperaba ${types.join('|')} y llegó ${typeOf(value)}`);
      return { ok: errors.length === 0, errors };
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && (schema.type === 'object' || schema.properties)) {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}.${key}: falta requerido`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) {
        const result = validateSchema(child, value[key], `${path}.${key}`);
        errors.push(...result.errors);
      }
    }
  }

  if (Array.isArray(value) && (schema.type === 'array' || schema.items)) {
    if (schema.items) {
      value.forEach((item, index) => {
        const result = validateSchema(schema.items, item, `${path}[${index}]`);
        errors.push(...result.errors);
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateSchema };
