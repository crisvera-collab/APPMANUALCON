
const ORDEN_CATEGORIAS = ["leve", "grave", "gravisima", "situacion", "ruta", "beneficio", "norma"];

const CATEGORIA_LABEL = {
  leve: "Falta leve",
  grave: "Falta grave",
  gravisima: "Falta gravísima",
  situacion: "Situación",
  ruta: "Ruta / procedimiento",
  beneficio: "Beneficio",
  norma: "Norma",
};

const CATEGORIA_TITULO = {
  leve: "Faltas leves",
  grave: "Faltas graves",
  gravisima: "Faltas gravísimas",
  situacion: "Situaciones tipo I, II y III",
  ruta: "Rutas, protocolos y procedimientos",
  beneficio: "Beneficios y estímulos",
  norma: "Normas, derechos y deberes",
};

function escapeHtml(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa el texto y convierte los saltos de línea en <br>. */
function textoHtml(texto) {
  return escapeHtml(texto).replace(/\n/g, "<br />");
}

/** Mensaje estándar cuando el backend no responde. */
function mensajeServidor(contexto, detalle) {
  let texto =
    "No fue posible " +
    contexto +
    ". El servidor no está activo: haz doble clic en «Iniciar Automanual.bat» " +
    "(carpeta raíz del proyecto) y vuelve a intentarlo.";
  if (typeof location !== "undefined" && location.protocol === "file:") {
    texto +=
      "\n\nConsejo: no abras el HTML como archivo (file://). Entra por http://localhost:3000/manual.html";
  }
  if (detalle) texto += "\n\nDetalle técnico: " + detalle;
  return texto;
}

/** Botón que reintenta la carga de la página (para los estados de error). */
function botonReintentar(etiqueta) {
  return (
    '<button type="button" class="btn-retry" onclick="location.reload()">' +
    escapeHtml(etiqueta || "Reintentar") +
    "</button>"
  );
}

/* URL base de la API.
   - Producción (Render, red del colegio u otro host): la página la sirve el
     propio backend → mismo origen ("") sin importar el puerto (443 en HTTPS).
   - Archivo local (file://) → backend en localhost:3000.
   - localhost con otro puerto (p. ej. Live Server en :5500) → backend en :3000. */
const API_BASE = (function () {
  if (typeof location === "undefined") return "";
  if (location.protocol === "file:" || !location.hostname) return "http://localhost:3000";
  const esLocal =
    /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  if (esLocal && location.port !== "3000") {
    return location.protocol + "//" + location.hostname + ":3000";
  }
  return ""; // mismo origen (incluye Render: https://...onrender.com)
})();

/** GET/POST a la API que lanza error si la respuesta no es 2xx.
 *  Si el servidor no responde (p. ej. se está arrancando) reintenta con
 *  espera creciente antes de rendirse, para que un arranque lento no se
 *  traduzca en un error visible para la persona usuaria. */
async function apiJson(url, opciones) {
  const destino = API_BASE + url;
  const ESPERAS = [0, 700, 1500];
  let ultimoError = new Error("sin respuesta de " + destino);

  for (let intento = 0; intento < ESPERAS.length; intento++) {
    if (ESPERAS[intento]) await new Promise((ok) => setTimeout(ok, ESPERAS[intento]));

    let res;
    try {
      res = await fetch(destino, opciones);
    } catch (_) {
      ultimoError = new Error("sin respuesta de " + destino);
      continue; // fallo de red: se reintenta
    }

    if (!res.ok) throw new Error("HTTP " + res.status + " en " + destino);
    return res.json();
  }

  throw ultimoError;
}

/** Ordena las categorías conocidas primero y las desconocidas al final. */
function categoriasOrdenadas(porCategoria) {
  const conocidas = ORDEN_CATEGORIAS.filter((c) => porCategoria[c]);
  const resto = Object.keys(porCategoria).filter((c) => !ORDEN_CATEGORIAS.includes(c));
  return conocidas.concat(resto);
}

/** Mayúsculas/minúsculas por palabra (para títulos). */
function modoTitulo(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/(^|[\s(«:"'\-—])([a-záéíóúüñ])/g, (_, p, c) => p + c.toUpperCase());
}

/* ----------------------- Resaltado de coincidencias --------------------- */

/** Reemplaza <mark> por los términos buscados (escape previo incluido). */
function resaltar(texto, palabras) {
  let salida = escapeHtml(texto);
  if (!palabras || !palabras.length) return salida;
  const terminos = palabras
    .filter((p) => p && p.length > 2)
    .sort((a, b) => b.length - a.length)
    .map((p) => String(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terminos.length) return salida;
  try {
    const re = new RegExp("(" + terminos.join("|") + ")(?![^<]*>)", "gi");
    salida = salida.replace(re, "<mark>$1</mark>");
  } catch (_) {
    /* regex inválida: se devuelve sin resaltar */
  }
  return salida;
}

/** Chip de "mejor coincidencia" para la primera tarjeta de búsqueda. */
function tarjetaDestacada() {
  return '<p class="best-match-flag">✦ La sección que más te puede servir</p>';
}

/** Tarjeta de artículo reutilizada por la búsqueda. */
function tarjetaResultado(item, palabras) {
  const cat = escapeHtml(item.categoria || "");
  const etiqueta = escapeHtml(CATEGORIA_LABEL[item.categoria] || item.categoria || "");
  const resumen = item.resumen || item.contenido || "";
  const p = palabras || [];

  const detalle =
    item.contenido || item.acciones
      ? `<details>
          <summary>Ver detalle</summary>
          <div class="result-card__full">
            ${item.contenido ? `<p>${resaltar(item.contenido, p)}</p>` : ""}
            ${item.acciones ? `<p><strong>Qué se hace:</strong> ${resaltar(item.acciones, p)}</p>` : ""}
          </div>
        </details>`
      : "";

  const enlace = item.seccionId
    ? `<a class="result-card__link" href="manual.html#${escapeHtml(item.seccionId)}">Ver en el manual completo →</a>`
    : "";

  return `<article class="result-card" data-categoria="${cat}">
    <div class="result-card__meta">
      <span class="tag tag--severity" data-categoria="${cat}">${etiqueta}</span>
      ${item.articulo ? `<span class="tag">${escapeHtml(item.articulo)}</span>` : ""}
      ${item.seccionTitulo ? `<span class="tag">${escapeHtml(item.seccionTitulo)}</span>` : ""}
    </div>
    <h3 class="result-card__title">${resaltar(modoTitulo(item.titulo) || "Sin título", p)}</h3>
    <p class="result-card__snippet">${resaltar(resumen, p)}</p>
    ${detalle}
    ${enlace}
  </article>`;
}

/* ---------------------- Botón "Instalar app" (PWA) ---------------------- */

function initInstalacion(selector) {
  const boton = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!boton) return;

  let eventoInstalacion = null;

  // Si ya está instalada (o en iOS standalone), no mostramos el botón.
  const yaInstalada =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (yaInstalada) return;

  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalacion = evento;
    boton.classList.add("is-visible");
  });

  boton.addEventListener("click", async () => {
    if (!eventoInstalacion) return;
    eventoInstalacion.prompt();
    try {
      await eventoInstalacion.userChoice;
    } catch (_) {
      /* el usuario canceló */
    }
    eventoInstalacion = null;
    boton.classList.remove("is-visible");
  });

  window.addEventListener("appinstalled", () => {
    eventoInstalacion = null;
    boton.classList.remove("is-visible");
  });
}

/* ------------------------------- Chat ---------------------------------- */

const ROL_ETIQUETA = { estudiante: "Estudiante", docente: "Docente" };

function initChat(opciones) {
  const caja = document.querySelector(opciones.messagesSelector);
  const formulario = document.querySelector(opciones.formSelector);
  const entrada = document.querySelector(opciones.inputSelector);
  if (!caja || !formulario || !entrada) return;

  // Rol del usuario (estudiante / docente). Se guarda entre sesiones.
  let rol = localStorage.getItem("automanual.rol") || "estudiante";
  const botonesRol = document.querySelectorAll(opciones.roleSelector || "[data-rol]");

  function pintarRol() {
    botonesRol.forEach((b) => b.classList.toggle("is-active", b.dataset.rol === rol));
  }

  botonesRol.forEach((b) => {
    b.addEventListener("click", () => {
      rol = b.dataset.rol === "docente" ? "docente" : "estudiante";
      localStorage.setItem("automanual.rol", rol);
      pintarRol();
      const aviso = document.createElement("div");
      aviso.className = "msg msg--system";
      aviso.textContent = "Ahora recibes recomendaciones como " + ROL_ETIQUETA[rol] + ".";
      caja.appendChild(aviso);
      desplazar();
    });
  });
  pintarRol();

  function desplazar() {
    caja.scrollTop = caja.scrollHeight;
  }

  function agregarMensaje(texto, tipo, data) {
    const burbuja = document.createElement("div");
    burbuja.className = "msg msg--" + (tipo === "user" ? "user" : "bot");

    const articulo = (data && data.articulo) || null;

    if (tipo !== "user" && articulo) {
      const insignia = document.createElement("span");
      insignia.className = "msg__badge";
      insignia.dataset.categoria = articulo.categoria || "";
      insignia.textContent = [CATEGORIA_LABEL[articulo.categoria] || "", articulo.articulo || ""]
        .filter(Boolean)
        .join(" · ");
      burbuja.appendChild(insignia);
    }

    const parrafos = String(texto == null ? "" : texto).split(/\n{2,}/);

    if (tipo === "user") {
      burbuja.innerHTML = textoHtml(texto);
    } else {
      const cuerpo = document.createElement("div");
      cuerpo.innerHTML =
        "<strong>" +
        escapeHtml(parrafos[0]) +
        "</strong>" +
        parrafos
          .slice(1)
          .map((p) => "<br /><br />" + escapeHtml(p))
          .join("");
      burbuja.appendChild(cuerpo);

      // Pasos a seguir personalizados según rol
      const pasos = (data && data.pasos) || [];
      if (pasos.length) {
        const lista = document.createElement("div");
        lista.className = "msg__steps";
        lista.innerHTML =
          '<p class="msg__steps-title">Pasos a seguir (' +
          escapeHtml(ROL_ETIQUETA[(data && data.rol) || rol] || "recomendación") +
          ")</p><ol>" +
          pasos.map((s) => "<li>" + escapeHtml(s) + "</li>").join("") +
          "</ol>";
        burbuja.appendChild(lista);
      }

      // Sugerencias de apoyo derivadas del manual (por problemática y rol)
      const sugerencias = (data && data.sugerencias) || [];
      if (sugerencias.length) {
        const tips = document.createElement("div");
        tips.className = "msg__tips";
        tips.innerHTML =
          '<p class="msg__tips-title">Sugerencias sobre tu caso</p><ul>' +
          sugerencias.map((s) => "<li>" + escapeHtml(s) + "</li>").join("") +
          "</ul>";
        burbuja.appendChild(tips);
      }

      // Otras consultas del manual relacionadas (se envían al hacer clic)
      const relacionadas = (data && data.relacionadas) || [];
      if (relacionadas.length) {
        const bloque = document.createElement("div");
        bloque.className = "msg__related";
        bloque.innerHTML = '<p class="msg__related-title">También te puede interesar (manual)</p>';
        relacionadas.forEach((r) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "msg__related-btn";
          chip.textContent = r.etiqueta || r.pregunta;
          chip.addEventListener("click", () => enviar(r.pregunta));
          bloque.appendChild(chip);
        });
        burbuja.appendChild(bloque);
      }

      // Aclaración: las respuestas y sugerencias provienen solo del manual
      if (data && data.nota) {
        const nota = document.createElement("p");
        nota.className = "msg__note";
        nota.textContent = data.nota;
        burbuja.appendChild(nota);
      }

      // Enlace directo a la sección del manual original
      if (articulo && articulo.seccionId) {
        const enlace = document.createElement("a");
        enlace.className = "msg__source";
        enlace.href = "manual.html#" + articulo.seccionId;
        enlace.textContent = "Ver esta sección en el manual original →";
        burbuja.appendChild(enlace);
      }
    }

    caja.appendChild(burbuja);
    desplazar();
    return burbuja;
  }

  function agregarTyping() {
    const indicador = document.createElement("div");
    indicador.className = "msg msg--bot";
    indicador.innerHTML =
      '<span class="typing-dots"><span></span><span></span><span></span></span>';
    caja.appendChild(indicador);
    desplazar();
    return indicador;
  }

  async function enviar(pregunta) {
    const texto = String(pregunta == null ? "" : pregunta).trim();
    if (!texto) return;

    entrada.value = "";
    agregarMensaje(texto, "user");

    const indicador = agregarTyping();
    try {
      const data = await apiJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: texto, rol: rol }),
      });
      indicador.remove();
      agregarMensaje(data.texto || "No obtuve una respuesta.", "bot", data);
    } catch (error) {
      indicador.remove();
      const burbuja = agregarMensaje(
        mensajeServidor("conectar con el asistente", error && error.message),
        "bot"
      );
      // Reenvía la última pregunta en lugar de pedir recargar la página.
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "btn-retry";
      boton.textContent = "Reintentar";
      boton.addEventListener("click", () => {
        boton.disabled = true;
        burbuja.remove();
        enviar(texto);
      });
      burbuja.appendChild(boton);
    }
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviar(entrada.value);
  });

  if (opciones.suggestionSelector) {
    document.querySelectorAll(opciones.suggestionSelector).forEach((boton) => {
      boton.addEventListener("click", () => enviar(boton.dataset.pregunta || boton.textContent));
    });
  }

  agregarMensaje(
    "¡Hola! Soy el asistente del Manual de Convivencia del Colegio OEA I.E.D. Cuéntame tu situación y te indicaré el artículo, la gravedad de la falta, los pasos a seguir y sugerencias de apoyo, todo con base en el manual y según seas " +
      ROL_ETIQUETA.estudiante +
      " o " +
      ROL_ETIQUETA.docente +
      ".",
    "bot"
  );
}

/* Manual completo (texto íntegro) */

async function renderManualCompleto(opciones) {
  const toc = document.querySelector(opciones.tocSelector);
  const contenido = document.querySelector(opciones.contentSelector);
  if (!contenido) return;

  contenido.innerHTML = '<p class="empty-state">Cargando el manual completo…</p>';

  try {
    const data = await apiJson("/api/manual/completo");
    const capitulos = data.capitulos || [];
    if (!capitulos.length) throw new Error("sin capítulos");

    // Índice: capítulos + sus secciones
    if (toc) {
      toc.innerHTML = capitulos
        .map(
          (cap) =>
            `<div class="toc-chapter">
              <a class="toc-chapter__title" href="#${escapeHtml(cap.id)}">${escapeHtml(
              cap.num && cap.num !== "—" ? "Cap. " + cap.num + " — " + modoTitulo(cap.titulo) : modoTitulo(cap.titulo)
            )}</a>
              <div class="toc-chapter__sections">${(cap.secciones || [])
                .map(
                  (s) =>
                    `<a href="#${escapeHtml(s.id)}">${escapeHtml(recortarTitulo(s.titulo))}</a>`
                )
                .join("")}</div>
            </div>`
        )
        .join("");
    }

    contenido.innerHTML = capitulos
      .map((cap) => {
        const tituloCap =
          cap.num && cap.num !== "—"
            ? "Capítulo " + cap.num + ": " + modoTitulo(cap.titulo)
            : modoTitulo(cap.titulo);
        return `<section class="manual-chapter" id="${escapeHtml(cap.id)}">
        <h2 class="manual-chapter__title">${escapeHtml(tituloCap)}</h2>
        ${(cap.secciones || [])
          .map(
            (s) => `<section class="manual-section" id="${escapeHtml(s.id)}">
          <h3 class="manual-section__title">${escapeHtml(modoTitulo(recortarTitulo(s.titulo)))}</h3>
          ${(s.parrafos || [])
            .map((p) => (p.t === "li" ? `<li>${textoHtml(p.x)}</li>` : `<p>${textoHtml(p.x)}</p>`))
            .join("")}
        </section>`
          )
          .join("")}
      </section>`;
      })
      .join("");

    // Animar los <li> sueltos en listas continuas (mejor que el replace en string)
    contenido.querySelectorAll(".manual-section").forEach((sec) => {
      let ul = null;
      [...sec.children].forEach((el) => {
        if (el.tagName === "LI") {
          if (!ul) {
            ul = document.createElement("ul");
            el.before(ul);
          }
          ul.appendChild(el);
        } else {
          ul = null;
        }
      });
    });

    enlazarAnclas(window.location.hash.replace(/^#/, ""));
  } catch (error) {
    contenido.innerHTML =
      '<p class="empty-state">' +
      escapeHtml(mensajeServidor("cargar el manual completo", error && error.message)) +
      "</p>" +
      botonReintentar();
  }
}

/** Abre y resalta la sección indicada en la URL (#sec-…). */
function enlazarAnclas(id) {
  if (!id) return;
  const destino = document.getElementById(id);
  if (!destino) return;
  destino.classList.add("is-highlighted");
  destino.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => destino.classList.remove("is-highlighted"), 3500);
}

/** Acorta títulos muy largos para el índice lateral. */
function recortarTitulo(t) {
  const limpio = String(t || "")
    .replace(/^\d+(\.\d+)*\.?\s*/, "")
    .replace(/\s*—\s*$/, "")
    .trim();
  if (limpio.length <= 64) return limpio;
  return limpio.slice(0, 62).replace(/\s+\S*$/, "") + "…";
}

/* ---------------------------- Búsqueda --------------------------------- */

function initBusqueda(opciones) {
  const entrada = document.querySelector(opciones.inputSelector);
  const contenedorChips = document.querySelector(opciones.chipsSelector);
  const cajaResultados = document.querySelector(opciones.listSelector);
  const cajaConteo = document.querySelector(opciones.countSelector);
  const boton = opciones.buttonSelector ? document.querySelector(opciones.buttonSelector) : null;
  if (!entrada || !cajaResultados) return;

  let categoria = "todas";
  let temporizador = null;

  function pintarConteo(total) {
    if (!cajaConteo) return;
    cajaConteo.textContent = total
      ? total + (total === 1 ? " artículo encontrado" : " artículos encontrados")
      : "";
  }

  async function buscar() {
    const q = entrada.value.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoria !== "todas") params.set("categoria", categoria);

    cajaResultados.innerHTML = '<p class="empty-state">Buscando…</p>';

    try {
      const data = await apiJson("/api/manual?" + params.toString());
      const items = data.resultados || [];
      const palabras = data.resaltar || [];
      pintarConteo(items.length);

      if (!items.length) {
        cajaResultados.innerHTML =
          '<p class="empty-state">Sin coincidencias para «' +
          escapeHtml(q || "esa búsqueda") +
          '». Prueba con otra palabra o cambia de categoría.</p>';
        return;
      }

      // La primera tarjeta se muestra destacada: es la sección más útil
      const primero =
        '<div class="best-match">' +
        (q ? tarjetaDestacada() : "") +
        tarjetaResultado(items[0], palabras) +
        "</div>";
      const resto = items.slice(1).map((item) => tarjetaResultado(item, palabras)).join("");
      cajaResultados.innerHTML = primero + resto;
    } catch (error) {
      pintarConteo(0);
      cajaResultados.innerHTML =
        '<p class="empty-state">' +
        escapeHtml(mensajeServidor("realizar la búsqueda", error && error.message)) +
        "</p>" +
        botonReintentar();
    }
  }

  function buscarConRetardo() {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 300);
  }

  entrada.addEventListener("input", buscarConRetardo);

  entrada.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      clearTimeout(temporizador);
      buscar();
    }
  });

  if (boton) {
    boton.addEventListener("click", () => {
      clearTimeout(temporizador);
      buscar();
    });
  }

  if (contenedorChips) {
    contenedorChips.addEventListener("click", (evento) => {
      const chip = evento.target.closest(".chip");
      if (!chip || !contenedorChips.contains(chip)) return;
      contenedorChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      categoria = chip.dataset.categoria || "todas";
      buscar();
    });
  }

  // Carga inicial con todo el manual.
  buscar();
}
