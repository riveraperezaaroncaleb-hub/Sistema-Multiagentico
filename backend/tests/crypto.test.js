const assert = require('assert');
const { encrypt, decrypt, maskKey } = require('../src/services/crypto.service');

console.log('🧪 Iniciando prueba de cifrado AES-256-GCM...');

// Prueba 1: Cifrado y descifrado exitoso
const testApiKey = 'sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz';
const encryptedResult = encrypt(testApiKey);

assert(encryptedResult.encryptedData, 'Debe generar datos cifrados');
assert(encryptedResult.iv, 'Debe generar un IV');
assert(encryptedResult.authTag, 'Debe generar un Auth Tag');
assert.strictEqual(encryptedResult.last4, 'wxyz', 'Los últimos 4 caracteres deben ser wxyz');
assert.notStrictEqual(encryptedResult.encryptedData, testApiKey, 'El texto cifrado no debe contener la clave original');

const decryptedText = decrypt(encryptedResult);
assert.strictEqual(decryptedText, testApiKey, 'El texto descifrado debe coincidir exactamente con el original');
console.log('✓ Prueba 1 superada: Cifrado y descifrado coinciden');

// Prueba 2: Detección de alteración o manipulación (Auth Tag falla si alguien cambia 1 byte)
let tampered = { ...encryptedResult };
// Cambiamos el último caracter del encryptedData
tampered.encryptedData = tampered.encryptedData.slice(0, -1) + (tampered.encryptedData.slice(-1) === 'a' ? 'b' : 'a');

assert.throws(() => {
  decrypt(tampered);
}, /Unsupported state or unable to authenticate data/, 'Debe rechazar datos manipulados con error de autenticación');
console.log('✓ Prueba 2 superada: Detecta manipulación de datos (Integridad garantizada)');

// Prueba 3: Enmascaramiento para UI
const masked = maskKey(testApiKey);
assert.strictEqual(masked, '••••••••wxyz');
console.log('✓ Prueba 3 superada: Enmascaramiento seguro');

console.log('🎉 Todas las pruebas de cifrado pasaron exitosamente!');
