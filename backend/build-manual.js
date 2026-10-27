"use strict";
/**
 * build-manual.js — Genera backend/data/manualData.js desde
 * documents/manual_fuente.txt (texto extraído del .docx oficial del
 * Manual de Convivencia del Colegio OEA I.E.D. 2026).
 *
 * Uso:  node build-manual.js
 *
 * El generador:
 *  1. Limpia ruido de la extracción (IDs de formas de Word, números sueltos,
 *     líneas duplicadas, artefactos de portada).
 *  2. Divide el texto en capítulos y secciones (usando títulos numerados,
 *     títulos en MAYÚSCULAS y títulos duplicados, propios del documento).
 *  3. Extrae las faltas (leves/graves/gravísimas) como artículos individuales.
 *  4. Extrae situaciones tipo I/II/III, correctivos y entradas del glosario.
 *  5. Escribe data/manualData.js con CAPITULOS (texto completo, para el
 *     apartado "Manual original") y MANUAL_DATA (artículos, para chat y
 *     búsqueda).
 */

const fs = require("fs");
const path = require("path");

const RUTA_FUENTE = path.join(__dirname, "..", "documents", "manual_fuente.txt");
const RUTA_SALIDA = path.join(__dirname, "data", "manualData.js");

const CATEGORIA_LABEL = {
  leve: "Falta leve",
  grave: "Falta grave",
  gravisima: "Falta gravísima",
  situacion: "Situación escolar",
  ruta: "Ruta / procedimiento",
  beneficio: "Beneficio / estímulo",
  norma: "Norma del manual",
};

const ORDEN_CATEGORIAS = ["leve", "grave", "gravisima", "situacion", "ruta", "beneficio", "norma"];

const TITULOS_CAPITULO = {
  I: "Preámbulo y fundamentos",
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function normalizar(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function contarLetras(t) {
  return (String(t).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
}

function esMayusculas(t) {
  return contarLetras(t) >= 4 && t === t.toUpperCase();
}

function extraerNum(t) {
  const m = t.match(/^(\d+(?:\.\d+)+)/);
  return m ? m[1] : "";
}

function tituloSinNum(t) {
  return t.replace(/^\d+(?:\.\d+)*\.?\s*/, "").trim();
}

/* Limpia una línea cruda; devuelve "" para líneas en blanco y null para ruido. */
function limpiarLinea(cruda) {
  if (cruda == null) return null;
  if (/^\s*$/.test(cruda)) return "";
  const conTab = /^\t/.test(cruda);
  let t = cruda.replace(/\t/g, " ");
  // IDs de formas de Word (9+ dígitos pegados al texto)
  t = t.replace(/\d{9,}/g, " ");
  // IDs con formato 123456-12345 (6-6/7) — teléfonos (7-7) se conservan
  t = t.replace(/\b\d{6}-\d{5}\b/g, " ");
  // Números pegados a una palabra que inicia en mayúscula: "118Correctivos"
  t = t.replace(/\b\d{1,4}(?=[A-ZÁÉÍÓÚÜÑ]{3})/g, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (contarLetras(t) < 2) return null; // "M", "12345", "- -"
  // Artefactos de WordArt: "COL E GIO", "O E A", "I .E .D"
  const palabras = t.split(/\s+/);
  if (
    palabras.length >= 3 &&
    t === t.toUpperCase() &&
    palabras.every((p) => contarLetras(p) <= 3) &&
    palabras.join("").length <= 12
  ) {
    return null;
  }
  return (conTab ? "\t" : "") + t;
}

/* Separa "…medio ambienteCAPÍTULO III…" en dos líneas. */
function dividirCapitulosPegados(lineas) {
  const out = [];
  for (let l of lineas) {
    let idx;
    while ((idx = l.search(/CAP[ÍI]TULO\s+[IVX]/)) > 0) {
      out.push(l.slice(0, idx));
      l = l.slice(idx);
    }
    out.push(l);
  }
  return out;
}

/* Convierte un bloque de líneas en párrafos (p) y viñetas (li). */
function aParrafos(bloque) {
  const out = [];
  for (const raw of bloque) {
    const esLi = /^\t/.test(raw) || /^[a-záéíóúñ]\.\s/.test(raw.trim());
    if (esLi) {
      out.push({ t: "li", x: raw.replace(/^\t+/, "").trim() });
      continue;
    }
    const t = raw.trim();
    if (!t) continue;
    const last = out.length ? out[out.length - 1] : null;
    const esContinuacion =
      !!last &&
      last.t === "p" &&
      (!/[.!?:…]["”']?\s*$/.test(last.x) || /^[a-záéíóúñ¡"“(]/.test(t));
    if (esContinuacion) last.x = (last.x + " " + t).replace(/\s+/g, " ");
    else out.push({ t: "p", x: t });
  }
  return out;
}

function parrafosATexto(parrafos) {
  return parrafos
    .map((p) => (p.t === "li" ? "• " + p.x : p.x))
    .join("\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Detección de encabezados                                           */
/* ------------------------------------------------------------------ */

// Sub-marcadores que NO deben abrir sección (tablas de faltas, etc.)
function esMarcador(T) {
  return (
    /^EJE\s/.test(T) ||
    /^(LEVES|GRAVES|GRAV[IÍ]SIMAS?)$/.test(T) ||
    /^DESCRIPTOR$/.test(T) ||
    /^SITUACIONES TIPO III$/.test(T) ||
    /^TIPO (I{1,3})$/.test(T)
  );
}

function esEncabezado(lineas, i, tituloSeccionActual) {
  const T = (lineas[i] || "").trim();
  if (!T || T.length > 190) return false;
  if (esMarcador(T)) return false;
  if (normalizar(T) === normalizar(tituloSeccionActual || "")) return false; // repetido → contenido
  const T2 = (lineas[i + 1] || "").trim();
  const dup = T === T2 && T.length <= 170 && contarLetras(T) >= 4;
  const numerado =
    /^\d+(\.\d+)+\.?\s+[A-ZÁÉÍÓÚÜÑ0-9]/.test(T) && T.length <= 170 && (esMayusculas(T) || dup);
  const caps = esMayusculas(T) && T.length <= 150 && T.split(/\s+/).length <= 14;
  const dosPuntos =
    T.length <= 110 && T.split(/\s+/).length <= 12 && /^[A-ZÁÉÍÓÚÜÑ]/.test(T) && T.endsWith(":");
  return dup || numerado || caps || dosPuntos;
}

/* ------------------------------------------------------------------ */
/* Limpieza global del texto fuente                                    */
/* ------------------------------------------------------------------ */

function leerYLimpiar() {
  const crudo = fs.readFileSync(RUTA_FUENTE, "utf8").split(/\r?\n/);
  const limpias = [];
  for (const l of crudo) {
    const c = limpiarLinea(l);
    if (c === null) continue; // ruido
    limpias.push(c);
  }
  return dividirCapitulosPegados(limpias);
}

/* ------------------------------------------------------------------ */
/* Capítulos y secciones                                               */
/* ------------------------------------------------------------------ */

function armarCapitulos(lineas) {
  // El cuerpo útil comienza en los símbolos (Himno); antes está portada + TOC.
  let inicio = lineas.findIndex((l) => /himno de colombia/i.test(l));
  if (inicio < 0) inicio = 0;
  const cuerpo = lineas.slice(inicio);

  const capitulosBrutos = [];
  let cap = { num: "—", titulo: "Símbolos escolares e himnos", lineas: [] };
  for (const l of cuerpo) {
    const m = l.trim().match(/^CAP[ÍI]TULO\s+([IVX]+)\b[:.\s]*(.*)$/);
    if (m) {
      if (cap.lineas.length) capitulosBrutos.push(cap);
      const num = m[1];
      let titulo = (m[2] || "").replace(/\s*\d{1,3}\s*$/, "").replace(/^[:.\-\s]+/, "").trim();
      if (!titulo) titulo = TITULOS_CAPITULO[num] || "";
      cap = { num, titulo, lineas: [] };
    } else {
      cap.lineas.push(l);
    }
  }
  capitulosBrutos.push(cap);

  // Secciones por capítulo
  return capitulosBrutos.map((c) => {
    const secciones = [];
    let sec = { titulo: "Introducción", num: "", lineas: [] };
    for (let i = 0; i < c.lineas.length; i++) {
      const l = c.lineas[i];
      if (esEncabezado(c.lineas, i, sec.titulo)) {
        const T = l.trim();
        secciones.push(sec);
        sec = { titulo: T, num: extraerNum(T), lineas: [] };
        if ((c.lineas[i + 1] || "").trim() === T) i++; // consumir duplicado
        continue;
      }
      const T = l.trim();
      const ultima = sec.lineas.length ? sec.lineas[sec.lineas.length - 1].trim() : "";
      if (T && T === ultima) continue; // duplicado consecutivo
      sec.lineas.push(l);
    }
    secciones.push(sec);

    // Post-proceso: muchos títulos del documento (p. ej. "PROTOCOLO DE
    // CONCILIACIÓN ESCOLAR") vienen seguidos de un sub-título y su texto real
    // aparece después. Si una sección quedó casi vacía, se antepone su título
    // a la sección siguiente para no perder el encabezado.
    const post = [];
    for (let i = 0; i < secciones.length; i++) {
      const s = secciones[i];
      const contenido = s.lineas.join(" ").trim();
      if (contenido.length < 25) {
        const next = secciones[i + 1];
        if (next) {
          const numA = extraerNum(s.titulo);
          const numB = extraerNum(next.titulo);
          const distintoNum = numA && numB && numA !== numB;
          if (!distintoNum) {
            next.titulo = `${s.titulo.replace(/\s*[:.]?\s*$/, "")} — ${next.titulo}`.replace(/\s+/g, " ");
            next.num = next.num || numA;
            continue;
          }
        }
        // Sin a dónde fusionar: se conserva tal cual (aunque esté casi vacía).
      }
      post.push(s);
    }

    return { num: c.num, titulo: c.titulo, secciones: post };
  });
}

/* ------------------------------------------------------------------ */
/* Extracción de faltas (Capítulo IV)                                  */
/* ------------------------------------------------------------------ */

const PASOS_FALTA = {
  leve: [
    "El docente identifica el hecho y clasifica si es situación o falta; si es falta, la categoriza como leve.",
    "Aplica medidas pedagógicas de índole reflexivas y tangibles, y establece la reparación (prometer, pedir disculpas, reparar, adoptar, comprender, cuidar de otros).",
    "Registra en el observador pedagógico-convivencial con las firmas del estudiante y notifica al acudiente.",
    "Verifica el cumplimiento de las medidas, la reparación y la no repetición.",
  ],
  grave: [
    "El docente clasifica y categoriza la falta como grave, aplica medidas pedagógicas y la reparación.",
    "Informa por escrito al coordinador de convivencia (además del registro y la notificación al acudiente).",
    "Si el estudiante reincide, se remite al departamento de orientación y a coordinación: la falta pasa a gravísima.",
    "Verifica el cumplimiento y la no repetición.",
  ],
  gravisima: [
    "El docente remite de inmediato a coordinación de convivencia con informe de las medidas aplicadas.",
    "Se garantiza el debido proceso: descargos del estudiante con su acudiente presente.",
    "Coordinación presenta el caso ante el comité de apoyo de la jornada con los soportes de orientación.",
    "Si compete al SRPA se activa el protocolo correspondiente (línea 123 si hay riesgo).",
    "Correctivos según el manual: compromisos, trabajo pedagógico, matrícula en observación y, en casos graves, cancelación de matrícula.",
  ],
};

function extraerFaltas(capitulos) {
  const capIV = capitulos.find((c) => c.num === "IV");
  if (!capIV) return { faltas: [], seccionFaltasId: null };

  let eje = "";
  let sev = null;
  let seccionFaltasId = null;
  const faltas = [];

  for (const sec of capIV.secciones) {
    const tituloN = normalizar(sec.titulo);
    if (tituloN === "faltas") sec._id = sec._id || "faltas";
    for (const linea of sec.lineas) {
      const T = linea.replace(/^\t+/, "").trim();
      if (!T) continue;
      if (sec._id === "faltas") seccionFaltasId = sec.id;
      if (normalizar(sec.titulo) === "faltas") {
        seccionFaltasId = sec.id;
        if (/^EJE\s+/i.test(T)) {
          eje = T.replace(/^EJE\s+/i, "").trim();
          sev = null;
          continue;
        }
        if (/^(LEVES)$/i.test(T)) { sev = "leve"; continue; }
        if (/^(GRAVES)$/i.test(T)) { sev = "grave"; continue; }
        if (/^GRAV[IÍ]SIMAS?$/i.test(T)) { sev = "gravisima"; continue; }
        if (/^(FALTAS|DESCRIPTOR|SITUACIONES TIPO III)$/i.test(T)) continue;
      }
      const esItem = /^\t/.test(linea) || /^[a-záéíóúñ]\.\s/.test(T);
      if (esItem && sev && normalizar(sec.titulo) === "faltas") {
        faltas.push({ sev, eje, texto: T.replace(/^[a-záéíóúñ]\.\s/, "") });
      }
    }
  }
  return { faltas, seccionFaltasId };
}

/* ------------------------------------------------------------------ */
/* Situaciones tipo I/II/III y glosario                                */
/* ------------------------------------------------------------------ */

function extraerSituaciones(capitulos) {
  const capIV = capitulos.find((c) => c.num === "IV");
  const out = [];
  let seccionId = null;
  if (!capIV) return { situaciones: out, seccionId };
  for (const sec of capIV.secciones) {
    if (normalizar(sec.titulo) === "situaciones") seccionId = sec.id;
  }
  for (const sec of capIV.secciones) {
    if (normalizar(sec.titulo) !== "situaciones") continue;
    for (const linea of sec.lineas) {
      const T = linea.replace(/^\t+/, "").trim();
      const m = T.match(/^Situaciones Tipo\s+(I{1,3}|l)\./);
      if (m) {
        const tipo = m[1] === "l" ? "I" : m[1];
        out.push({ tipo, texto: T });
      }
    }
  }
  return { situaciones: out, seccionId };
}

function extraerGlosario(capitulos) {
  const capVI = capitulos.find((c) => c.num === "VI");
  const out = [];
  if (!capVI) return { entradas: [], seccionId: null };
  let seccionId = capVI.secciones.length ? capVI.secciones[0].id : null;

  for (const sec of capVI.secciones) {
    let actual = null;
    for (const linea of sec.lineas) {
      const T = linea.replace(/^\t+/, "").trim();
      if (!T) continue;
      const m = T.match(/^(.{3,90}?)\.\s+(?=[A-ZÁÉÍÓÚÜÑ¿"(])/);
      const esInicio = m && !/[.!?:]$/.test(m[1]) && m[1].split(/\s+/).length <= 14;
      if (esInicio) {
        if (actual) out.push(actual);
        actual = { termino: m[1].trim(), texto: T };
      } else if (actual) {
        actual.texto += " " + T;
      }
    }
    if (actual) out.push(actual);
  }
  return { entradas: out, seccionId };
}

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */

function categoriaSeccion(titulo) {
  const t = normalizar(titulo);
  if (/estimul|premio|distincion|reconocimiento|beca|cuadro de honor|mencion/.test(t)) return "beneficio";
  if (
    /protocolo|ruta de atencion|debido proceso|conciliacion|acciones pedag|correctivos|procedimiento|instancias|comite|canales de atencion|matricula|^situaciones de presun|^caso (i{1,3}|ii)|debi proceso/.test(t)
  )
    return "ruta";
  return "norma";
}

function recortar(t, n) {
  t = String(t || "").trim();
  if (t.length <= n) return t;
  const corte = t.slice(0, n);
  const sp = corte.lastIndexOf(" ");
  return corte.slice(0, sp > 40 ? sp : n).trim() + "…";
}

function palabrasClaveDe(titulo, contenido) {
  const stop = new Set([
    "para","como","este","esta","estos","estas","mismo","misma","desde","hasta","entre","sobre","todo","toda","todos","todas",
    "porque","cuando","donde","cual","cuales","qué","como","mas","muy","sin","sus","sus","del","los","las","una","uno","unos",
    "unas","por","con","que","por","segun","hecho","forma","personas","cualquier","tiene","puede","debe","bien","manual",
    "convivencia","colegio","oea","ied","estudiante","estudiantes",
  ]);
  const palabras = normalizar(titulo + " " + recortar(contenido, 400))
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  const vistas = new Set();
  const claves = [];
  for (const p of palabras) {
    if (vistas.has(p)) continue;
    vistas.add(p);
    claves.push(p);
    if (claves.length >= 24) break;
  }
  return claves;
}

/* ------------------------------------------------------------------ */
/* Principal                                                           */
/* ------------------------------------------------------------------ */

function main() {
  const lineas = leerYLimpiar();
  let capitulos = armarCapitulos(lineas);

  // Ids de sección (las líneas se conservan hasta terminar las extracciones)
  for (const cap of capitulos) {
    cap.id = "cap-" + normalizar(cap.num === "—" ? "simbolos" : cap.num).replace(/[^a-z0-9-]/g, "");
    cap.secciones.forEach((s, i) => {
      s.id = cap.id + "-s" + (i + 1);
    });
  }

  const { faltas, seccionFaltasId } = extraerFaltas(capitulos);
  const { situaciones, seccionId: seccionSituacionesId } = extraerSituaciones(capitulos);
  const { entradas: glosario, seccionId: seccionGlosarioId } = extraerGlosario(capitulos);

  // Convertir líneas → párrafos para la salida
  for (const cap of capitulos) {
    for (const s of cap.secciones) {
      s.parrafos = aParrafos(s.lineas || []);
      delete s.lineas;
    }
  }

  const items = [];
  let n = 0;
  const nuevoId = (p) => `${p}-${++n}`;

  /* Capítulo institucional curado (portada oficial) */
  items.push({
    id: nuevoId("info"),
    categoria: "norma",
    articulo: "Información institucional",
    titulo: "Contacto, sedes y equipo directivo del Colegio OEA I.E.D.",
    resumen:
      "NIT 800.181.747-0, DANE 11100115605. Sede A: Cra 72L #34-19 sur (Tel. 2734831 / 5630829). Sede B: Cra 69 bis #39-30 sur.",
    contenido:
      "Colegio OEA I.E.D. — Institución Educativa Distrital. NIT 800.181.747-0 · DANE 11100115605. Lema: «La comunicación fundamento del conocimiento y la convivencia» — 54 años «Tejiendo vidas».\n\n" +
      "Sede A: Dirección Carrera 72L #34-19 sur. Teléfonos 2734831 / 5630829. E-mail: cedoea8@educacionbogota.edu.co\n" +
      "Sede B: Dirección Carrera 69 bis #39-30 sur.\n\n" +
      "Rectora: Sonia Fajardo López. Coordinadores: J.M. Teresa Pérez Pérez, J.M. Carlos Prieto Polania, J.T. Rosa Amparo Ruiz Saray. Coordinador sede B (J.M. y J.T.): Juan Carlos Alvis Benavides. Coordinadora Media Fortalecida: Sandra Teresa Arcos Martínez.",
    acciones: "",
    palabrasClave: ["direccion", "sedes", "telefono", "rectora", "contacto", "equipo", "directivo", "coordinadores", "email", "dane", "nit"],
    capitulo: "",
    capituloTitulo: "Información institucional",
    seccionId: null,
    seccionTitulo: "Contacto y equipo",
  });

  /* Secciones generales */
  for (const cap of capitulos) {
    for (const sec of cap.secciones) {
      const contenidoOriginal = parrafosATexto(sec.parrafos);
      const tn = normalizar(sec.titulo);
      // La sección de Faltas y el Glosario se cubren con artículos individuales.
      if (tn === "faltas" || cap.num === "VI") continue;
      // Algunos protocolos aparecen en el manual solo como diagrama/imágenes:
      // se conservan igualmente como artículo para que el chat y la búsqueda
      // puedan enlazarlos.
      const esProtocoloVacio = contenidoOriginal.length < 40 && /protocolo/.test(tn);
      if (contenidoOriginal.length < 40 && !esProtocoloVacio) continue;
      const contenido = esProtocoloVacio
        ? `${sec.titulo.replace(/[\d.\s]+$/, "").trim()}. Este protocolo figura en el documento original como esquema o diagrama: consulta el PDF oficial del manual (apartado «Manual original») para ver el detalle gráfico completo.`
        : contenidoOriginal;
      const cat = categoriaSeccion(sec.titulo);
      const acciones =
        cat === "ruta"
          ? sec.parrafos
              .filter((p) => p.t === "li")
              .slice(0, 5)
              .map((p) => p.x)
              .join(" · ")
          : "";
      items.push({
        id: nuevoId("sec"),
        categoria: cat,
        articulo: sec.num ? `Art. ${sec.num}` : (cap.num === "—" ? "Símbolos" : `Cap. ${cap.num}`),
        titulo: tituloSinNum(sec.titulo) || sec.titulo,
        resumen: recortar(parrafosATexto(sec.parrafos.filter((p) => p.t === "p").slice(0, 2)), 190),
        contenido,
        acciones: recortar(acciones, 400),
        palabrasClave: palabrasClaveDe(tituloSinNum(sec.titulo), contenido),
        capitulo: cap.num,
        capituloTitulo: cap.titulo,
        seccionId: sec.id,
        seccionTitulo: tituloSinNum(sec.titulo) || sec.titulo,
      });
    }
  }

  /* Faltas individuales */
  const ejeBonito = (e) =>
    e
      ? "Eje " + e.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
      : "Cap. IV";
  for (const f of faltas) {
    items.push({
      id: nuevoId("falta"),
      categoria: f.sev,
      articulo: ejeBonito(f.eje),
      titulo: recortar(f.texto, 96),
      resumen: recortar(f.texto, 190),
      contenido: f.texto,
      acciones: (PASOS_FALTA[f.sev] || []).join(" "),
      palabrasClave: palabrasClaveDe(f.texto.slice(0, 96), f.texto),
      capitulo: "IV",
      capituloTitulo: "Faltas, situaciones, protocolos y acciones correctivas",
      seccionId: seccionFaltasId,
      seccionTitulo: "Faltas",
    });
  }

  /* Situaciones tipo I/II/III */
  const PASOS_SIT = {
    I: [
      "El docente aplica los protocolos garantizando los derechos de los NNA y establece medidas pedagógicas y reparaciones.",
      "Registra en el observador con firmas y notifica al acudiente.",
      "Verifica el cumplimiento y la no repetición.",
    ],
    II: [
      "Activa el protocolo de atención correspondiente y recoge los soportes.",
      "Remite de inmediato a Orientación y a Coordinación de convivencia.",
      "Coordinación presenta el caso ante el comité de apoyo de la convivencia de la jornada.",
    ],
    III: [
      "Activa el protocolo de inmediato y asegura la integridad de las personas (línea 123 si hay riesgo).",
      "Mantén la confidencialidad de la información del adolescente (Ley 1581 de 2012).",
      "Remite al comité institucional de convivencia y, si compete, a la autoridad competente (SRPA).",
    ],
  };
  for (const s of situaciones) {
    items.push({
      id: nuevoId("situacion"),
      categoria: "situacion",
      articulo: `Situación tipo ${s.tipo}`,
      titulo: recortar(`Situación tipo ${s.tipo}: ${s.texto.replace(/^Situaciones Tipo\s+(I{1,3}|l)\.\s*/i, "")}`, 96),
      resumen: recortar(s.texto, 190),
      contenido: s.texto,
      acciones: (PASOS_SIT[s.tipo] || []).join(" "),
      palabrasClave: palabrasClaveDe("situacion tipo protocolo", s.texto),
      capitulo: "IV",
      capituloTitulo: "Faltas, situaciones, protocolos y acciones correctivas",
      seccionId: seccionSituacionesId,
      seccionTitulo: "Situaciones",
    });
  }

  /* Glosario */
  for (const g of glosario) {
    items.push({
      id: nuevoId("glos"),
      categoria: "norma",
      origen: "glosario",
      articulo: "Glosario",
      titulo: g.termino,
      resumen: recortar(g.texto.replace(g.termino + ".", "").trim(), 190),
      contenido: g.texto,
      acciones: "",
      palabrasClave: palabrasClaveDe(g.termino, g.texto),
      capitulo: "VI",
      capituloTitulo: "Glosario",
      seccionId: seccionGlosarioId,
      seccionTitulo: "Glosario",
    });
  }

  /* Orden de presentación */
  items.sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a.categoria);
    const ib = ORDEN_CATEGORIAS.indexOf(b.categoria);
    if (ia !== ib) return ia - ib;
    return String(a.id).localeCompare(String(b.id));
  });

  // Estado del manual (útil para diagnóstico)
  const stats = {
    capitulos: capitulos.length,
    secciones: capitulos.reduce((s, c) => s + c.secciones.length, 0),
    faltas: faltas.length,
    situaciones: situaciones.length,
    glosario: glosario.length,
    articulos: items.length,
  };

  fs.mkdirSync(path.dirname(RUTA_SALIDA), { recursive: true });
  const salida =
    "// Generado automáticamente por build-manual.js — NO editar a mano.\n" +
    "// Fuente: documents/manual_fuente.txt (Manual de Convivencia Colegio OEA I.E.D. 2026).\n" +
    "const CATEGORIA_LABEL = " +
    JSON.stringify(CATEGORIA_LABEL, null, 2) +
    ";\n\n" +
    "const ORDEN_CATEGORIAS = " +
    JSON.stringify(ORDEN_CATEGORIAS) +
    ";\n\n" +
    "const CAPITULOS = " +
    JSON.stringify(capitulos, null, 1) +
    ";\n\n" +
    "const MANUAL_DATA = " +
    JSON.stringify(items, null, 1) +
    ";\n\n" +
    "module.exports = { MANUAL_DATA, CAPITULOS, CATEGORIA_LABEL, ORDEN_CATEGORIAS };\n";

  fs.writeFileSync(RUTA_SALIDA, salida, "utf8");

  const kb = (fs.statSync(RUTA_SALIDA).size / 1024).toFixed(0);
  console.log("✔ data/manualData.js generado (" + kb + " KB)");
  console.log("  " + JSON.stringify(stats, null, 2));
}

main();
