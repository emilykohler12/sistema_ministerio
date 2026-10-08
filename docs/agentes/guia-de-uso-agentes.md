# Arquitectura de agentes — Guía de uso

Cómo trabajar día a día con los agentes del DAM.
Para el porqué de cada decisión, ver [diseno-arquitectura-agentes.md](diseno-arquitectura-agentes.md).

---

## 1. Primera vez (cada uno, una sola vez)

1. Instalar Claude Code e iniciar sesión con tu cuenta.
2. Clonar el repo y abrir Claude Code en la raíz: `claude`.
3. Aceptar el diálogo de confianza del proyecto (habilita hooks y skills del repo).
4. `npm install`.
5. Crear tus archivos personales (no se commitean):
   - `CLAUDE.local.md`: tus URLs locales, datos de prueba.
   - `.claude/settings.local.json`: claves y variables de Supabase (cuando se integre).
6. Cuando Supabase esté integrado: levantar Supabase local con `npx supabase start`.
7. Verificar que todo cargó:
   - `/context` → aparece `CLAUDE.md`.
   - `/output-style` → está activo **Ingeniero en Sistemas**.
   - `@` en el prompt → aparecen los 5 agentes del proyecto.
   - `/hooks` → aparecen los 4 hooks.
   - `/skills` → aparecen las skills del proyecto.
8. Opcional: agregar en tu `~/.claude/settings.json` un hook de notificación para que te avise cuando Claude necesita respuesta.

---

## 2. Trabajo diario

Siempre en **una sola conversación** con el ingeniero. Él delega en los subagentes.

### Empezar algo

Contale qué querés hacer, en lenguaje natural:

> Quiero agregar la gestión de talleres en el panel de admin.

El ingeniero:
1. Te dice qué **carril** eligió (directo / chico / feature) y por qué.
2. Te hace preguntas si algo es ambiguo.
3. Te presenta opciones con ventajas, desventajas y su recomendación.

Si no estás de acuerdo con el carril, decíselo.

### Según el carril

**Directo** (typo, texto, una línea)
→ Lo hace y te muestra que los checks pasan. Nada más.

**Chico** (un componente, un bug acotado)
→ Plan breve → lo aprobás → implementa → revisa → te muestra el resultado.

**Feature** (algo nuevo e importante)
1. `/spec <nombre>`: el ingeniero te entrevista y escribe `docs/specs/<nombre>/spec.md`.
2. El crítico opina sobre la spec. El ingeniero te muestra en qué coincide y en qué no.
3. **Vos aprobás la spec.** Este es el punto de control más importante.
4. El ingeniero delega: tests → implementación → crítica + revisión.
5. Si el implementador se traba, el ingeniero te pregunta. Respondés y sigue solo.
6. Al final te presenta: resumen, evidencia de tests y desvíos de la spec.

### Cerrar

- `/pr` → commit con Conventional Commits y PR con el diff.
- Tu compañero revisa el PR. **Ningún PR se mergea sin revisión humana.**

---

## 3. Comandos útiles

| Comando | Para qué |
|---|---|
| `/spec <feature>` | Empezar una feature con entrevista y spec |
| `/criticar <ruta>` | Pedir opinión crítica sobre una spec, un archivo o una idea |
| `/decision <tema>` | Registrar una decisión en `docs/decisiones/` |
| `/pr` | Crear commit y pull request |
| `/verify` | Levantar la app y verificar un cambio funcionando |
| `/clear` | Limpiar el contexto al cambiar a un tema no relacionado |
| `/rewind` o `Esc Esc` | Volver a un punto anterior de la conversación o del código |
| `Esc` | Frenar a Claude en medio de una acción para redirigirlo |
| `Shift+Tab` | Entrar/salir de plan mode (solo lee y planifica) |

---

## 4. Buenas prácticas

- **Una conversación, un tema.** Cambiás de feature → `/clear`.
- **Si corregiste dos veces lo mismo**, `/clear` y volvé a pedirlo mejor explicado.
- **Sé específico:** nombrá archivos, decí qué queda afuera, cómo se verifica.
- **Pedí evidencia**, no afirmaciones: "mostrame la salida de los tests".
- **Discutí con el ingeniero.** Preguntale por qué. Ese es el punto de esta arquitectura.
- **No persigas cada comentario del crítico.** Si no mejora la simplicidad o la corrección, se descarta.
- **Leé `docs/specs/<feature>/`** de lo que hizo tu compañero antes de tocar esa parte.

---

## 5. Coordinación entre los dos

- Cada uno trabaja en su rama: `feat/<feature>` o `fix/<bug>`.
- No trabajen la misma feature a la vez sin avisarse.
- Toda decisión de diseño importante va a `docs/decisiones/` con `/decision`.
- Si cambian un agente, skill, regla o hook: **PR aparte** y que lo revise el otro.

---

## 6. Mantenimiento

| Cuándo | Qué hacer |
|---|---|
| Un agente repite un error | Corregir su prompt, skill o regla en un PR |
| Una instrucción se repite en el chat | Pasarla a CLAUDE.md, una regla o una skill |
| Cada tanto | `/doctor prompt-audit` para detectar instrucciones viejas o contradictorias |
| Cada tanto | `/skill-doctor` para ver qué skills no se usan |
| Cambia cómo se levanta el proyecto | Volver a correr `/run-skill-generator` |

---

## 7. Si algo no funciona

| Problema | Revisar |
|---|---|
| Claude no sigue una instrucción | `/context` para ver si cargó. Si es obligatoria, pasarla a un hook |
| Un hook no se ejecuta | `/hooks`, confianza del proyecto aceptada, script con Node disponible |
| Una skill no se activa | Que la `description` diga cuándo usarla, o invocarla con `/nombre` |
| Un subagente no aparece | Frontmatter con `name` y `description` válidos; reiniciar si la carpeta es nueva |
| El agente pide permiso todo el tiempo | Agregar el comando seguro a `permissions.allow` |
