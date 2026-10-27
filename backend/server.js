/**
 * server.js — Servidor de AutomanualVCP.
 *
 * - Sirve los archivos estáticos de /frontend y el PDF original en /documents.
 * - API:
 *     GET  /api/manual?categoria=&q=      → artículos (ordenados por relevancia si hay q)
 *     GET  /api/manual/completo           → capítulos y secciones con el texto íntegro
 *     POST /api/chat   { pregunta, rol }  → respuesta del asistente (rol: docente|estudiante)
 *
 * Protecciones de seguridad aplicadas:
 *   - Cabeceras: CSP (solo recursos propios), anti-clickjacking, nosniff,
 *     Referrer-Policy, Permissions-Policy y sin "X-Powered-By".
 *   - CORS restringido a file:// y localhost; quien entra por la red local
 *     usa la app en mismo origen y no necesita CORS.
 *   - Límite de peticiones por IP (chat y búsqueda) con 429 + Retry-After.
 *   - Tamaños acotados: cuerpo JSON 32 KB, pregunta 1000 caracteres,
 *     término de búsqueda 300 caracteres, categoría con lista permitida.
 *   - Errores sin trazas ni rutas internas en la respuesta.
 *   - Las consultas de los usuarios nunca se escriben en los logs.
 *
 * Cómo correrlo:
 *   cd backend
 *   npm install     (solo la primera vez)
 *   npm start       → http://localhost:3000
 *
 * Por defecto atiende también a la red del colegio (HOST=0.0.0.0). Si algún
 * día se quiere usar SOLO en esta máquina, definir la variable de entorno
 * HOST=127.0.0.1 antes de arrancar.
 */

const path = require("path");
const express = require("express");
const { MANUAL_DATA, CAPITULOS, CATEGORIA_LABEL, ORDEN_CATEGORIAS } = require("./data/manualData");
const { responderPregunta, buscarItems, palabrasResaltar, normalizar } = require("./ia");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // 0.0.0.0 = accesible también por la red local

app.disable("x-powered-by"); // no revela el marco web que se usa
/* confía en UN salto del proxy (el de Render en la nube, o el de la red local
   si existe). Así req.ip es la IP real de cada persona usuaria y el límite de
   peticiones se aplica por usuario, no a todos por igual. Sin X-Forwarded-For
   (uso local directo) req.ip sigue siendo la IP real del equipo. */
app.set("trust proxy", 1);

/* ------------------------- Cabeceras de seguridad ---------------------- */

/* Política de seguridad del contenido: la página solo puede cargar
   recursos de este mismo servidor (sin scripts, estilos, imágenes ni
   conexiones de terceros). 'unsafe-inline' hace falta porque los HTML
   usan <script> y style="..." embebidos. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/* Orígenes desde los que OTRA página puede usar la API (CORS):
   - "null"                          → página abierta como archivo local (file://)
   - localhost / 127.0.0.1 / [::1]   → Live Server u otras variantes (cualquier puerto)
   Quien entra por http://IP-de-la-red carga la app en mismo origen: el
   navegador no aplica CORS y todo funciona sin esta cabecera. Cualquier
   otro sitio web (p. ej. una página maliciosa abierta en la computadora
   de un estudiante) queda fuera. */
function origenPermitido(origen) {
  if (!origen) return null;
  if (origen === "null") return "null";
  try {
    const u = new URL(origen);
    const esLocal =
      u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    if (esLocal && (u.protocol === "http:" || u.protocol === "https:")) return origen;
  } catch (_) {
    /* origen ilegible: se ignora */
  }
  return null;
}

app.use((req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff"); // el navegador no "adivina" tipos
  res.header("X-Frame-Options", "DENY"); // nadie incrusta la app en otra página (clickjacking)
  res.header("Referrer-Policy", "no-referrer"); // no se filtra la URL visitada a terceros
  res.header(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()"
  );
  res.header("Content-Security-Policy", CSP);
  res.header("Cross-Origin-Opener-Policy", "same-origin"); // aísla la pestaña de ventanas ajenas

  const permitido = origenPermitido(req.get("Origin"));
  if (permitido) res.header("Access-Control-Allow-Origin", permitido);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.path.startsWith("/api")) {
    res.header("Cache-Control", "no-store"); // las consultas no quedan guardadas en cachés
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------------------- Límite de peticiones por IP -------------------- */
/* Ventana deslizante de 1 minuto, en memoria y sin dependencias: evita que
   una sola máquina (o un script) sature la API. Las páginas estáticas no
   se limitan. El mapa de IPs se limpia solo para no crecer sin control. */
const VENTANA_MS = 60000;
const LIMITE_CHAT = 30; // preguntas al asistente por minuto y IP
const LIMITE_BUSQUEDA = 120; // búsquedas del manual por minuto y IP
const USOS = new Map(); // ip -> momentos dentro de la ventana actual

function limitar(limite) {
  return (req, res, next) => {
    const ahora = Date.now();
    const ip = req.ip || "desconocida";
    let tiempos = USOS.get(ip);
    if (!tiempos) {
      tiempos = [];
      USOS.set(ip, tiempos);
    }
    while (tiempos.length && tiempos[0] <= ahora - VENTANA_MS) tiempos.shift();

    if (tiempos.length >= limite) {
      const espera = Math.max(1, Math.ceil((tiempos[0] + VENTANA_MS - ahora) / 1000));
      res.set("Retry-After", String(espera));
      return res.status(429).json({
        error: `Demasiadas consultas seguidas. Espera ${espera} segundos y vuelve a intentarlo.`,
      });
    }

    tiempos.push(ahora);
    if (USOS.size > 2000) {
      for (const [k, v] of USOS) {
        if (!v.length || v[v.length - 1] <= ahora - VENTANA_MS) USOS.delete(k);
      }
      if (USOS.size > 5000) USOS.clear(); // cortapisas ante inundación de IPs
    }
    next();
  };
}

app.use(express.json({ limit: "32kb" })); // cuerpos JSON acotados (antes 100 KB por defecto)
app.use(express.static(path.join(__dirname, "..", "frontend")));
// PDF original del manual (apartado "Manual original" → botón "Ver PDF oficial")
app.use("/documents", express.static(path.join(__dirname, "..", "documents")));

/* --------------------------- Salud del servidor ------------------------ */

app.get("/api/salud", (_req, res) => {
  // Solo lo mínimo para el chequeo automático de asegurar-servidor.ps1
  res.json({ ok: true, articulos: MANUAL_DATA.length });
});

/* ------------------------- Artículos (ranking) ------------------------- */

app.get("/api/manual", limitar(LIMITE_BUSQUEDA), (req, res) => {
  const { categoria, q } = req.query;
  // Lista permitida: cualquier otra categoría se trata como "todas".
  const categoriaLimpia = ORDEN_CATEGORIAS.includes(String(categoria))
    ? String(categoria)
    : "todas";

  if (q && String(q).trim()) {
    const consulta = String(q).trim().slice(0, 300); // tope de longitud
    const aciertos = buscarItems(consulta, { categoria: categoriaLimpia, limite: 40 });
    // buscarItems devuelve { item, puntaje }; la API expone los artículos planos.
    const resultados = aciertos.map((a) => ({ ...a.item, puntaje: Math.round(a.puntaje * 10) / 10 }));
    return res.json({
      total: resultados.length,
      consulta,
      resaltar: palabrasResaltar(consulta),
      resultados,
    });
  }

  let resultado = MANUAL_DATA;
  if (categoriaLimpia !== "todas") {
    resultado = resultado.filter((item) => item.categoria === categoriaLimpia);
  }
  res.json({ total: resultado.length, resaltar: [], resultados: resultado });
});

/* --------------------- Manual original (texto íntegro) ------------------ */

app.get("/api/manual/completo", limitar(LIMITE_BUSQUEDA), (_req, res) => {
  res.json({
    totalArticulos: MANUAL_DATA.length,
    capitulos: CAPITULOS,
    etiquetas: CATEGORIA_LABEL,
    orden: ORDEN_CATEGORIAS,
  });
});

/* -------------------------------- Chat --------------------------------- */

app.post("/api/chat", limitar(LIMITE_CHAT), async (req, res) => {
  const { pregunta, rol } = req.body || {};

  if (!pregunta || typeof pregunta !== "string" || !pregunta.trim()) {
    return res.status(400).json({ error: "Falta el campo 'pregunta' en el cuerpo de la petición." });
  }

  try {
    const respuesta = await responderPregunta(
      pregunta.trim().slice(0, 1000), // tope de longitud
      rol === "docente" || rol === "estudiante" ? rol : null
    );
    res.json(respuesta);
  } catch (error) {
    // Solo se registra el error técnico; la consulta del usuario NUNCA
    // se escribe en el log (los datos de los estudiantes no se filtran).
    console.error("Error generando respuesta:", error);
    res.status(500).json({ error: "No fue posible generar una respuesta en este momento." });
  }
});

/* ------------- Rutas de API inexistentes → respuesta JSON --------------- */

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

/* ------------------- Errores sin fugas de información ------------------- */
/* Respuesta genérica: nunca se expone una traza de errores ni rutas
   internas de la computadora a quien hace la petición. */

app.use((err, _req, res, _next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "La petición es demasiado grande." });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido." });
  }
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

app.listen(PORT, HOST, () => {
  console.log(`AutomanualVCP escuchando en http://localhost:${PORT} (host ${HOST})`);
  console.log(`  Artículos: ${MANUAL_DATA.length} · Capítulos: ${CAPITULOS.length}`);
});
