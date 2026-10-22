---
name: revision-critica
description: Úsala cuando una IA termine código, redacción o plan importante, antes de entregarlo al usuario.
---

Flujo:
1. La IA especialista entrega su resultado.
2. El crítico lo revisa con el prompt de arriba.
3. Si dice REHACER, la especialista corrige. Máximo 2 vueltas.
4. Si tras 2 vueltas sigue en REHACER, se le muestra al usuario
   con los problemas pendientes (decide el humano).
5. El costo de cada vuelta se registra en el control de tokens.

No se activa en: preguntas simples y respuestas cortas.
