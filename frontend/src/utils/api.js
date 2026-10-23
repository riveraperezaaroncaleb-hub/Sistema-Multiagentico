export async function readApiResponse(response, endpoint) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
      throw new Error(`El servidor devolvió una página HTML en ${endpoint} en vez de la API. Reinicia el backend y vuelve a cargar la aplicación.`);
    }
    throw new Error(`La respuesta de ${endpoint} no está en formato JSON (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `La solicitud a ${endpoint} falló (HTTP ${response.status}).`);
  }
  return data;
}
