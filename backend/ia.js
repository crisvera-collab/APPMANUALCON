/**
 * ia.js — Motor del chatbot del Manual de Convivencia (Colegio OEA I.E.D.).
 *
 * Responde SOLO con base en data/manualData.js (generado desde el manual
 * oficial). Capacidades:
 *   - Búsqueda ponderada con sinónimos (llegar tarde → impuntualidad, etc.).
 *   - Detección de rol (docente / estudiante) y recomendación paso a paso
 *     distinta para cada uno.
 *   - Sugerencias contextuales según la problemática planteada, siempre
 *     acompañadas de la aclaración de que provienen solo del manual.
 *   - Respuesta adecuada ante groserías / faltas de respeto.
 *   - Detección de consultas fuera del manual (matemáticas, clima, etc.).
 *   - Saludos y consultas meta (¿qué puedes hacer?) resueltas como asistente.
 */

const { MANUAL_DATA, CATEGORIA_LABEL } = require("./data/manualData");

/* ----------------------------- Utilidades ----------------------------- */

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Letras repetidas propias del chat ("holaaa", "tardeee", "noooo"):
    // tres o más seguidas se reducen a una. Las dobles legítimas ("rr",
    // "ll") no se tocan.
    .replace(/([a-zñ])\1{2,}/g, "$1");
}

const VACIAS = new Set([
  "que","como","cual","cuales","cuando","donde","quien","quienes","por","para","con","sin","sobre",
  "una","uno","unos","unas","del","los","las","por","qué","cómo","dónde","quién","este","esta","estos",
  "estas","ese","esa","eso","mas","muy","hay","son","son","ser","puede","puedo","pueden","tengo","tiene",
  "quiero","dime","explica","explicame","hola","gracias","favor","manual","convivencia","colegio","oea",
  "estudiante","estudiantes","docente","docentes","mi","tu","su","sus","lo","la","le","les","al","yo",
  "me","te","se","nos","o","y","e","u","en","es","de","do","re","mi","fa","si","no","va","ve","ya",
  "varias","veces","vez","hace","hago","hacer","hoy","siempre","nunca","otra","despues","antes",
  "pasa","paso","pasan",
  // Muletillas y jerga cotidiana (niños y adolescentes) que no aportan
  // significado a la búsqueda.
  "porque","pues","osea","vale","bueno","buenos","buenas","nose","tambien","dice","dicen","digo",
  "parce","parcero","bro","man","hermano","asi","ok","dale","listo","grax","chevere","bacano","listo",
]);

/* Abreviaturas típicas del chat → palabra completa (se aplican por token). */
const ACORTIMIENTOS = new Map([
  ["q", "que"], ["k", "que"], ["xq", "porque"], ["pq", "porque"],
  ["xfa", "favor"], ["xfs", "favor"], ["toy", "estoy"], ["tmb", "tambien"],
  ["bno", "bueno"], ["aki", "aqui"], ["cm", "como"], ["noses", "no"],
  ["salu2", "saludos"], ["x2", "gracias"], ["qs", "que"], ["kien", "quien"],
  ["xk", "porque"], ["ta", "esta"], ["tas", "estas"], ["toy", "estoy"],
]);

function tokens(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 2 && !VACIAS.has(t))
    .map((t) => ACORTIMIENTOS.get(t) || t)
    .filter((t) => t.length > 2 && !VACIAS.has(t));
}

/* --------------------- Sinónimos / lenguaje natural -------------------- */
/* Cada grupo amplía la consulta: si el usuario menciona cualquier término,
   se refuerzan también los términos del grupo para encontrar el artículo. */

const GRUPOS = [
  { id: "impuntualidad", términos: ["tarde","tardanza","tardar","impuntual","impuntualidad","retraso","retrasado","atraso","puntual","puntualidad","retrasos","llegando tarde","no llegue","llego","llegue","llegado","atrasado","me atras","atrese","tardeo","tarde otra vez","no alcance"] },
  { id: "pelea", términos: ["pelea","pelear","pelearon","riña","riñas","golpe","golpes","golpearon","agresion","agredir","agredio","agredieron","pendencia","combate","pleito","golpeado","empujon","cachetada","pegar","pego","pegaron","discusion","discusiones","altercado","enfrentamiento","agarramos","agarraron","agarrarse","nos agarramos","a pases","pases","pisas","nos dimos","a las manos","se pusieron a pelear","nos peleamos","megaparon"] },
  { id: "groserias", términos: ["groseria","groserias","grosero","grosera","insulto","insultar","insultos","vulgar","vulgares","vocabulario","palabrotas","malas palabras","falta de respeto","falto al respeto","me falto al respeto","desprecio","desconsideracion","soez","me hablan mal","me hablo mal","me dijo groserias","me dicen nombres","nombres feos","me falta el respeto","no me respetan"] },
  { id: "acoso", términos: ["acoso","acosar","acosado","bullying","bulinearon","bulinguearon","matoneo","matonear","hostigamiento","hostigar","ciberacoso","ciberbullying","discriminacion","discriminar","racismo","racista","homofobia","homofobico","intimidacion","me hacen el vacio","me excluyen","me aislan","no me hablan","me tienen en contra","me funaron","funar","me ridiculizan","me apodan","me ponen apodos","se burlan","burla","burlan","me burlan","me molestan","me odian","bulinearon","botado","botada","me dejaron botado","me dejan botado","me dejan solo","me dejan sola","me excluyeron"] },
  { id: "hurto", términos: ["hurto","robo","robar","robado","me robaron","sustraccion","pertenencias","me robo","ladron","se llevaron","me quitaron","me sustrajeron","me desaparecieron"] },
  { id: "celular", términos: ["celular","celulares","celu","cel","cell","telefono","movil","dispositivo","whatsapp","whats","wpp","redes sociales","me lo quitaron","usar el celular","el celular"] },
  { id: "copiar", términos: ["copiar","copias","copia","plagio","fraude","trampa","trampas","chanceo","copiar el examen","me copiaron","copiarse","chancear"] },
  { id: "sancion", términos: ["sancion","sanciones","sancionar","castigo","castigos","castigar","correctivo","correctivos","medida","medidas","expulsion","expulsar","condicional","consecuencia","consecuencias","me castigaron","me pusieron falta","me pusieron una falta","me marcaron","me echaron","me quieren echar","me suspendieron","me llamaron la atencion","me mandaron a direccion","me quitaron el recreo"] },
  { id: "uniforme", términos: ["uniforme","uniformes","ropa","vestimenta","presentacion personal","vestuario","peinado","tenis"] },
  { id: "horario", términos: ["horario","horarios","jornada","hora","ingreso","entrada","recreo","descanso","tiempo de descanso","break","salida","hora de salida","patio"] },
  { id: "notas", términos: ["notas","nota","calificaciones","calificacion","promedio","evaluacion","examen","examenes","reprobar","reprobe","me fue mal","malas notas","sacar mal","puntuacion"] },
  { id: "promocion", términos: ["promocion","pasar de grado","graduarse","graduar","repetir","reprobado","reprobado","no promovido","promover","subir de grado","quede","me quede"] },
  { id: "conciliacion", términos: ["conciliacion","conciliar","mediacion","mediador","conflicto","conflictos","arreglarse","arreglar","dialogo","pelearon y queremos arreglarnos","hacer las paces","arreglarnos","volver a ser amigos","perdonar","reconciliacion"] },
  { id: "drogas", términos: ["drogas","droga","sustancias","psicoactivas","psicoactiva","alcohol","alcoholico","cigarrillo","fumar","fumo","consumo","consumir","spa","marihuana","bebidas","porro","mota","licor","cerveza","trago","embriaguez"] },
  { id: "suicida", términos: ["suicida","suicidio","suicidarse","quitarse la vida","autolesion","no quiero vivir","no quiero estar aqui","lastimarme"] },
  { id: "sexual", términos: ["acoso sexual","sexo","sexual","piropo","piropos","orientacion sexual","identidad de genero","genero","indebido","toque","me toco","me tocaron","me pidio fotos","me exhibio"] },
  { id: "derechos", términos: ["derechos","deberes","obligaciones","queja","quejas","peticion","denuncia","reclamo","trato digno","me pueden obligar","me obligan","no me dejan"] },
  { id: "matricula", términos: ["matricula","matricularme","inscripcion","inscribir","cupos","reingreso","estudiantes nuevos","estudiantes antiguos","me quiero salir","traslado"] },
  { id: "vandalismo", términos: ["vandalismo","danar","dano","danos","pintar","rayar","rayado","destruir","destrozo","rotura","grafiti","rompi","raye","quebre","dañe"] },
  { id: "permiso", términos: ["permiso","permisos","excusa","ausente","ausencia","inasistencia","falta injustificada","justificar","justificacion","no voy a ir","faltare","no fui"] },
  { id: "beneficios", términos: ["beneficio","beneficios","estimulo","estimulos","premio","premios","reconocimiento","beca","becas","estimular","me reconocen"] },
  { id: "protocolo", términos: ["protocolo","protocolos","procedimiento","procedimientos","ruta","rutas","como se hace","que hago","que hacer","quien me atiende","a quien le cuento","donde lo reporto"] },
  { id: "comite", términos: ["comite","comites","orientacion","orientador","coordinacion","coordinador","rectoria","rector"] },
  { id: "violencia", términos: ["violencia","violento","amenaza","amenazas","amenazar","miedo","armas","navaja","cuchillo","me amenazaron","me tienen amenazado"] },
  { id: "internet", términos: ["internet","online","en linea","web","tiktok","instagram","facebook","fotos","videos","memes","me grabaron","me difundieron","foto mia","video mio","captura"] },
  { id: "tareas", términos: ["tarea","tareas","deberes escolares","trabajo escolar","no hice la tarea"] },
  { id: "grado", términos: ["grado","anos escolares","undecimo","decimo","quinto","noveno"] },
  // Trato injusto dentro del aula (lenguaje cotidiano: «el profe me odia»).
  // Incluye palabras presentes en el texto del manual para que la expansión
  // del grupo realmente puntúe contra los artículos («respeto», «gritos»…).
  { id: "trato", términos: ["me odia","me odia el profe","el profe me odia","me tiene mania","me tiene en contra","me trata mal","favoritismo","me humillo","me grita","me regana","me regano","trato injusto","me discrimina el docente","no es justo","trato","respeto","respetar","digno","dignidad","maltrato","maltratar","maltrata","gritos","gritar","desprecio","desprecia","injusto","injusticia"] },
];

const INDICE_SINONIMOS = new Map();
for (const g of GRUPOS) {
  for (const t of g.términos) {
    const key = normalizar(t);
    if (!INDICE_SINONIMOS.has(key)) INDICE_SINONIMOS.set(key, new Set());
    for (const otro of g.términos) INDICE_SINONIMOS.get(key).add(normalizar(otro));
  }
}

/* ------------- Tolerancia a errores ortográficos (jerga/typos) --------- */
/* Distancia de Damerau-Levenshtein con corte temprano: permite detectar
   transposiciones ("grozseria") y typos típicos del chat adolescente. */
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const filas = [];
  for (let i = 0; i <= a.length; i++) filas.push([i, 0]);
  for (let j = 0; j <= b.length; j++) filas[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let menor = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(filas[i - 1][j] + 1, filas[i][j - 1] + 1, filas[i - 1][j - 1] + costo);
      // Transposición de letras adyacentes ("acro" ≈ "acro" → "acoso"/"asco").
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, filas[i - 2][j - 2] + 1);
      }
      filas[i][j] = v;
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
  }
  return filas[a.length][b.length];
}

/** ¿La palabra de la consulta corresponde a este término del grupo?
    Acepta igualdad, prefijo de 5 letras o error tipográfico leve. */
function coincideTermino(palabra, termino) {
  if (palabra === termino) return true;
  if (palabra.length >= 5 && termino.length >= 5) {
    if (termino.startsWith(palabra.slice(0, 5)) || palabra.startsWith(termino.slice(0, 5))) return true;
    const max = palabra.length >= 9 ? 2 : 1;
    if (distancia(palabra, termino, max) <= max) return true;
  }
  return false;
}

/* Vocabulario real del manual (palabras clave y títulos) indexado por
   longitud para corregir typos de la consulta hacia palabras del manual. */
const VOCAB = new Map(); // longitud → Set de palabras
function indexarVocabulario(palabra) {
  const p = normalizar(palabra).replace(/[^a-z0-9ñ]/g, "");
  if (p.length < 5 || p.length > 15) return;
  if (!VOCAB.has(p.length)) VOCAB.set(p.length, new Set());
  VOCAB.get(p.length).add(p);
}
for (const item of MANUAL_DATA) {
  for (const k of item.palabrasClave || []) indexarVocabulario(k);
  for (const w of normalizar(item.titulo).split(/[^a-z0-9ñ]+/)) indexarVocabulario(w);
}

/** Busca en el vocabulario una palabra parecida al typo del usuario. */
function corregir(palabra) {
  if (palabra.length < 5) return null;
  const max = palabra.length >= 9 ? 2 : 1;
  for (const delta of max === 2 ? [-2, -1, 0, 1, 2] : [-1, 0, 1]) {
    const candidatas = VOCAB.get(palabra.length + delta);
    if (!candidatas) continue;
    for (const c of candidatas) {
      if (c !== palabra && distancia(palabra, c, max) <= max) return c;
    }
  }
  return null;
}

/** Amplía una consulta con sinónimos (devuelve objetos {p, w}: palabra y peso). */
const CACHE_EXPANDIR = new Map();
function expandir(query) {
  if (CACHE_EXPANDIR.has(query)) return CACHE_EXPANDIR.get(query);
  const base = tokens(query);
  const vistas = new Map();
  for (const p of base) if (!vistas.has(p)) vistas.set(p, 1);
  const agregar = (s, w) => {
    const previo = vistas.get(s);
    if (previo == null) vistas.set(s, w);
    else vistas.set(s, Math.max(previo, w));
  };
  const expandirGrupoDe = (palabra, w) => {
    const exacto = INDICE_SINONIMOS.get(palabra);
    if (exacto) for (const s of exacto) agregar(s, Math.max(w, 0.6));
  };
  for (const p of base) {
    if (INDICE_SINONIMOS.has(p)) {
      expandirGrupoDe(p, 0.6); // término exacto del grupo
      continue;
    }
    // Coincidencia por prefijo de 5 letras: "groserías" ≈ "groseria",
    // "amenazan" ≈ "amenazar". El corte en 5 evita falsos ("consigo"
    // no debe activar "consecuencia").
    if (p.length >= 5) {
      let porPrefijo = false;
      const pref = p.slice(0, 5);
      for (const [k, set] of INDICE_SINONIMOS) {
        if (k.length >= 5 && k.startsWith(pref)) {
          for (const s of set) agregar(s, 0.45);
          porPrefijo = true;
        }
      }
      if (porPrefijo) continue;
      // Error tipográfico: primero contra términos de grupos, luego contra
      // el vocabulario real del manual.
      let corregida = null;
      for (const [k, set] of INDICE_SINONIMOS) {
        if (distancia(p, k, p.length >= 9 ? 2 : 1) <= (p.length >= 9 ? 2 : 1)) {
          for (const s of set) agregar(s, 0.5);
          corregida = k;
          break;
        }
      }
      if (!corregida) {
        const c = corregir(p);
        if (c) { agregar(c, 0.5); expandirGrupoDe(c, 0.5); }
      }
    }
  }
  // Frases compuestas de los grupos («me dejaron botado», «me odia el profe»):
  // los tokens no contienen espacios, así que se buscan contra la consulta
  // completa y, si aparecen, se refuerza todo el grupo.
  const consulta = normalizar(query);
  if (consulta.length > 4) {
    for (const g of GRUPOS) {
      if (
        g.términos.some((t) => {
          const tn = normalizar(t);
          return tn.includes(" ") && consulta.includes(tn);
        })
      ) {
        for (const t of g.términos) {
          if (!t.includes(" ")) agregar(normalizar(t), 0.55);
        }
      }
    }
  }
  // Frase completa
  const frase = normalizar(query).trim();
  const resultado = { palabras: vistas, frase: frase.length > 6 ? frase : "" };
  if (CACHE_EXPANDIR.size > 400) CACHE_EXPANDIR.clear();
  CACHE_EXPANDIR.set(query, resultado);
  return resultado;
}

/* ------------------------- Temas fuera del manual ---------------------- */

const FUERA_DE_MANUAL = [
  /cuanto es \d/, /\d\s*[\+\-\*\/x]\s*\d/, /tabla de multiplicar/,
  /noticias/, /receta/, /chiste/, /traduc/, /programacion/, /javascript|python|excel/,
  /partido|futbol|mundial|elecciones presidenciales|barcelona|real madrid|seleccion colombia|barras bravas/,
  /precio de|cuanto cuesta un/,
  /horoscopo|signos? zodiacal/, /musica|cancion|letra de|cantante|reggaeton|urbano|playlist|spotify/,
  /quien es el presidente/,
  // Vida cotidiana adolescente ajena al manual:
  /videojuego|fortnite|roblox|minecraft|free fire|counter|call of duty|play ?station|xbox|gta|among us/,
  /youtuber|twitch|streamer|tiktok de|seguidores|suscriptores/,
  /noviazgo|ligar|enamorad[oa]|(conseguir|consigo|tengo|para tener) (una )?(novia|novio)|me gusta (una chica|un chico)/,
  /netflix|pelicula|serie|capitulo|anime|manga/,
  /tarea (de|del) (mate|mates|matematicas|quimica|fisica|biologia|historia|geografia|ingles|lengua)|examen (de|del) (mate|mates|matematicas|quimica|fisica|biologia|historia|geografia|ingles)/,
  /ensayo|resumen (de|del)|monografia|presentacion de power ?point/,
  // Piden resolver o explicar materias: ayuda académica, no convivencia.
  /(explicame|explica|resuelve|resolver|hazme|ayudame a hacer|para hacer|como hago).*(mate|mates|matematicas|quimica|fisica|biologia|historia|geografia|ingles|lengua|literatura|tabla periodica|ecuacion|formula)/,
  /(tabla periodica|ecuacion|formula).*(mate|mates|matematicas|quimica|fisica|biologia)/,
  /moda|outfit|zapatillas de marca|tenis de marca/,
  /farandula|celebridad|influencer|famos[oa]/,
  /traductor|google|wikipedia|definicion de palabras/,
];

/* Temas ajenos inequívocos (no tienen nada que ver con convivencia escolar):
   se descartan siempre, aunque exista una coincidencia superficial de palabras. */
const FUERA_FUERTE = [
  /que clima|clima hace|como esta el clima|tiempo hace|va a llover|temperatura (hace|de hoy)/,
  /cuanto (es|son) \d/, /\d\s*[\+\-\*\/x]\s*\d/, /tabla de multiplicar/,
  /letra de (la|el|una)? ?(cancion|tema)|que dice la cancion/,
  /videojuego|fortnite|roblox|minecraft|free fire|play ?station|xbox|gta|among us/,
];

/* --------------------------- Groserías / faltas ------------------------ */

const GROSERIAS = [
  "malparido","malparida","hijueputa","hijueputo","gonorrea","gonorreas","careverga","carebo",
  "malnacido","malnacida","reputa","reputamadre","puta","puto","carajo","joder","mierda","mierdero",
  "imbecil","idiota","estupido","estupida","pendejo","pendeja","cabron","cabrona","marica","maricon",
  "huevon","huevona","gonorrea","hp","hpta","lpqtp","lpqmr","ctm","ptm","ptmre","malpari","basura",
  "inutil","tarado","tarada","bruto","bruta","sorete","concha","reconcha","la concha de",
  "tu mama","tu puta","chingar","chingues","verga","gonorrea de","mal hecho","no sirves","eres una mierda",
  "estafa","estafador","basura de bot","chat de mierda","programa inutil",
];

function detectarGroseria(texto) {
  const t = normalizar(texto);
  const encontradas = [];
  for (const g of GROSERIAS) {
    const gk = normalizar(g);
    if (gk.length < 3) continue;
    let coincide;
    if (gk.length <= 7) {
      // Términos cortos: exigir límites de palabra (evita "disputa" ≈ "puta")
      const re = new RegExp("\\b" + gk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      coincide = re.test(t);
    } else {
      coincide = t.includes(gk);
    }
    if (coincide) encontradas.push(g);
  }
  // Frases de falta de respeto dirigidas al asistente
  if (/(eres|es|sea|son)\s+(un|una|el|la)?\s*(basura|inutil|mierda|estafa|chatgpt malo)/.test(t)) {
    if (!encontradas.length) encontradas.push("falta de respeto");
  }
  return encontradas;
}

/* ------------------------------- Rol ----------------------------------- */

function detectarRol(pregunta, rolParam) {
  if (rolParam === "docente" || rolParam === "estudiante") return rolParam;
  const t = normalizar(pregunta);
  if (/\b(soy|como|en mi calidad de|trabajo como)\s+(el |la )?(docente|profesor|profesora|maestro|maestra|coordinador|orientador)/.test(t)) return "docente";
  if (/\b(mis estudiantes|mi clase|mi salon|les puse|el alumno de|la alumna de|debo aplicar|debo reportar)/.test(t)) return "docente";
  if (/\bsoy\s+(el |la )?(estudiante|alumno|alumna)\b/.test(t)) return "estudiante";
  if (/\b(mi nota|me sacaron|me castigaron|mi acudiente|el docente me|el profe me|me fue mal)/.test(t)) return "estudiante";
  return null;
}

/* --------------------------- Puntuación -------------------------------- */

/* Perfil de la consulta: se calcula una sola vez por texto y se cachea. */
const CONDUCTA_IDS = new Set([
  "pelea","groserias","acoso","hurto","celular","copiar","uniforme","drogas",
  "vandalismo","permiso","violencia","internet","impuntualidad","sancion",
]);
const TERMINOS_CONDUCTA = new Set();
for (const g of GRUPOS) {
  if (CONDUCTA_IDS.has(g.id)) for (const t of g.términos) TERMINOS_CONDUCTA.add(normalizar(t));
}

const CACHE_PERFIL = new Map();
function perfilConsulta(query) {
  if (CACHE_PERFIL.has(query)) return CACHE_PERFIL.get(query);
  const base = tokens(query);
  const t = normalizar(query);
  const esConducta = base.some(
    (p) =>
      TERMINOS_CONDUCTA.has(p) ||
      (p.length >= 4 && [...TERMINOS_CONDUCTA].some((k) => k.startsWith(p.slice(0, 4))))
  );
  const perfil = {
    esConducta,
    pideDefinicion: /^(que es|que son|significa|definicion|definic)/.test(t) || /\b(que es|que son|significa|definicion de)\b/.test(t),
    pideProtocolo: /\b(protocolo|ruta|procedimiento|como se atiende|conducto)\b/.test(t),
    pideFalta: /\b(falta|faltas|sancion|sanciones|castigo|castigos|expulsion|correctivos?|que pasa si|tarde|llego|llegue|impuntual|retraso|atraso)\b/.test(t),
    // Pares de palabras consecutivas de la consulta ("acoso escolar")
    pares: base.slice(0, -1).map((p, i) => p + " " + base[i + 1]).filter((s) => s.length >= 9),
  };
  if (CACHE_PERFIL.size > 400) CACHE_PERFIL.clear(); // tope: evita crecer sin límite
  CACHE_PERFIL.set(query, perfil);
  return perfil;
}

/* Patrones por palabra (frontera de palabra): evita que «gano» puntúe dentro
   de «engaños» o «sal» dentro de «salón». Cacheados por longitud de uso. */
const CACHE_RE = new Map();
function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function rePrefijo(p) {
  let r = CACHE_RE.get(p);
  if (!r) {
    r = new RegExp("\\b" + escaparRegex(p));
    if (CACHE_RE.size > 3000) CACHE_RE.clear();
    CACHE_RE.set(p, r);
  }
  return r;
}

/* Palabras clave por artículo, ya normalizadas (se cachean por objeto). */
const CACHE_KW = new Map();
function keywordsDe(item) {
  let kw = CACHE_KW.get(item);
  if (!kw) {
    kw = (item.palabrasClave || []).map((k) => normalizar(k)).filter(Boolean);
    if (CACHE_KW.size > 600) CACHE_KW.clear();
    CACHE_KW.set(item, kw);
  }
  return kw;
}

function puntuar(query, item) {
  const { palabras, frase } = expandir(query);
  const titulo = normalizar(item.titulo);
  const articulo = normalizar(item.articulo || "");
  const cuerpo = normalizar(item.contenido);
  const claves = keywordsDe(item);
  let puntaje = 0;

  for (const [p, w] of palabras) {
    const re = rePrefijo(p);
    if (re.test(titulo)) puntaje += 4 * w;
    else if (re.test(articulo)) puntaje += 2.5 * w;
    // Claves: igualdad, prefijo de la palabra clave («impuntual» en
    // «impuntualidad») o palabra clave contenida como raíz de la consulta.
    if (
      p.length >= 4 &&
      claves.some(
        (k) =>
          k === p ||
          (p.length >= 4 && k.startsWith(p)) ||
          (k.length >= 5 && p.startsWith(k))
      )
    ) {
      puntaje += 3 * w;
    }
    if (re.test(cuerpo)) puntaje += 1.2 * w;
  }
  if (frase) {
    if (rePrefijo(frase).test(titulo)) puntaje += 8;
    else if (cuerpo.includes(frase)) puntaje += 4;
  }

  // Ajustes de intención (cacheados por consulta)
  const perfil = perfilConsulta(query);
  // Par de palabras de la consulta apareciendo juntas en el título
  // ("protocolo de acoso escolar" → "...AGRESIÓN Y ACOSO ESCOLAR")
  for (const par of perfil.pares) {
    if (titulo.includes(par)) puntaje += 3;
  }
  if (["leve", "grave", "gravisima", "situacion"].includes(item.categoria)) puntaje *= 1.08;
  if (perfil.esConducta && !perfil.pideDefinicion) {
    // Ante una conducta concreta, la definición del glosario y los estímulos
    // son menos útiles que la falta o el protocolo correspondiente.
    if (item.origen === "glosario" || item.categoria === "beneficio") puntaje *= 0.62;
  }
  if (perfil.pideProtocolo) {
    if (item.categoria === "ruta" || item.categoria === "situacion") puntaje *= 1.2;
    const sinNumero = titulo.replace(/^[\d.\s]+/, "");
    if (sinNumero.startsWith("protocolo")) puntaje *= 1.15;
  }
  if (perfil.pideFalta && ["leve", "grave", "gravisima"].includes(item.categoria)) puntaje *= 1.18;
  return puntaje;
}

/** Busca artículos ordenados por relevancia. */
function buscarItems(query, { categoria = "", limite = 8, minimo = 3 } = {}) {
  let candidatos = MANUAL_DATA;
  if (categoria && categoria !== "todas") candidatos = candidatos.filter((i) => i.categoria === categoria);
  const puntuados = candidatos
    .map((item) => ({ item, puntaje: puntuar(query, item) }))
    .filter((r) => r.puntaje >= minimo);
  puntuados.sort((a, b) => b.puntaje - a.puntaje);
  return puntuados.slice(0, limite);
}

/** Palabras de la consulta que conviene resaltar en los resultados. */
function palabrasResaltar(query) {
  const { palabras } = expandir(query);
  return [...palabras.entries()]
    .filter(([p, w]) => w === 1 && p.length > 3)
    .map(([p]) => p)
    .slice(0, 6);
}

/* ------------------- Extracción del pasaje más relevante ---------------- */

function pasajeRelevante(item, query) {
  const { palabras } = expandir(query);
  const oraciones = String(item.contenido || "")
    .split(/(?<=[.;])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (oraciones.length <= 1) {
    const c = item.contenido || "";
    return c.length > 700 ? c.slice(0, 700).trim() + "…" : c;
  }
  const puntuadas = oraciones.map((o) => {
    const n = normalizar(o);
    let s = 0;
    for (const [p, w] of palabras) if (n.includes(p)) s += w;
    return { o, s };
  });
  const conPuntaje = puntuadas.filter((x) => x.s > 0);
  const elegidas = (conPuntaje.length ? conPuntaje : puntuadas.slice(0, 2))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.o);
  // Mantener el orden original del texto
  const ordenadas = oraciones.filter((o) => elegidas.includes(o));
  let texto = ordenadas.join(" ");
  if (texto.length < 250) texto = [ordenadas[0], oraciones.find((o) => !ordenadas.includes(o)) || ""].join(" ").trim();
  if (texto.length > 900) texto = texto.slice(0, 900).trim() + "…";
  return texto;
}

/* ---------------------- Recomendaciones paso a paso -------------------- */

function pasosPorRol(item, rol) {
  const cat = item.categoria;
  const esEst = rol !== "docente";
  const pasos = [];

  if (cat === "leve") {
    if (esEst) {
      pasos.push("Reconoce lo que pasó: el manual exige responder con honestidad y respeto.");
      pasos.push("Habla con tu docente, explica tu versión y pide disculpa si afectaste a alguien.");
      pasos.push("Cumple la medida pedagógica acordada (reparar, compensar, prometer o adoptar un cambio).");
      pasos.push("Firma con tu docente el registro en el observador pedagógico-convivencial.");
      pasos.push("Verifica con tu docente que la falta quedó cerrada; si reincides pasa a falta grave.");
    } else {
      pasos.push("Identifica el hecho y clasifícalo: ¿es situación o falta? Si es falta, ¿leve, grave o gravísima?");
      pasos.push("Dialoga con el estudiante y acuerda medidas pedagógicas de índole reflexiva y tangible.");
      pasos.push("Define la reparación (pedir disculpa, compensar, reparar, comprometer la no repetición).");
      pasos.push("Registra en el observador pedagógico-convivencial con firmas y notifica al acudiente.");
      pasos.push("Da seguimiento: si reincide, informa por escrito a coordinación (pasa a falta grave).");
    }
  } else if (cat === "grave") {
    if (esEst) {
      pasos.push("Detén de inmediato la conducta y reconoce el daño causado.");
      pasos.push("Preséntate con tu docente o coordinador y explica lo ocurrido con respeto.");
      pasos.push("Tu acudiente será citado y firmará el compromiso de no repetición.");
      pasos.push("Cumple la medida acordada y asiste al acompañamiento de orientación si se solicita.");
      pasos.push("Si reincides, la falta sube a gravísima: se abre debido proceso en el comité de convivencia.");
    } else {
      pasos.push("Categoriza la falta como grave y regístrala el mismo día en el observatorio.");
      pasos.push("Aplica las medidas pedagógicas (reflexivas, tangibles) y la reparación acordada.");
      pasos.push("Informa por escrito a coordinación de convivencia y notifica al acudiente con firma.");
      pasos.push("Remite a orientación escolar si la conducta se repite o afecta a otros estudiantes.");
      pasos.push("Si reincide, escríbelo como falta gravísima y activa el debido proceso en el comité.");
    }
  } else if (cat === "gravisima") {
    if (esEst) {
      pasos.push("Detén la situación ahora y busca ayuda de un docente o del coordinador de inmediato.");
      pasos.push("Preséntate con tu acudiente ante coordinación: se te garantiza el debido proceso y el derecho a la defensa.");
      pasos.push("Da tu versión de los hechos antes de que se tome una decisión.");
      pasos.push("Cumple el plan de acción y el seguimiento que indique el comité de convivencia.");
      pasos.push("Ten en cuenta que los correctivos pueden llegar a la cancelación de la matrícula por reincidencia.");
    } else {
      pasos.push("Actúa de inmediato y garantiza la integridad de las personas involucradas.");
      pasos.push("Registra los hechos y remite el caso con informe a coordinación de convivencia.");
      pasos.push("Notifica al acudiente y activa el debido proceso (descargos, comité de apoyo escolar).");
      pasos.push("Aplica el protocolo correspondiente; si hay riesgo, contacta la Línea 123 y a la autoridad competente.");
      pasos.push("Hace seguimiento escrito hasta el cierre del caso y verifica la no repetición.");
    }
  } else if (cat === "situacion") {
    if (esEst) {
      pasos.push("Cuenta lo ocurrido a un docente, al orientador o a coordinación: no lo guardes en silencio.");
      pasos.push("El colegio activará el protocolo que corresponda según el tipo de situación.");
      pasos.push("Participa en las acciones de restablecimiento que se acuerden contigo y tu acudiente.");
      pasos.push("Tu información será confidencial: se protegen tus datos y tu dignidad.");
    } else {
      pasos.push("Activa el protocolo correspondiente (tipo I, II o III) y garantiza los derechos de los NNA.");
      pasos.push("Registra el caso y mantén la confidencialidad de la información.");
      pasos.push("Notifica a coordinación/orientación y, si aplica, al comité de convivencia.");
      pasos.push("Define acciones de restablecimiento y haz seguimiento hasta el cierre.");
    }
  } else if (cat === "ruta") {
    if (item.acciones) {
      item.acciones
        .split(/·|\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 12)
        .slice(0, 6)
        .forEach((s) => pasos.push(s));
    }
    if (!pasos.length) {
      pasos.push("Ubica la instancia que menciona el manual (docente, orientación, coordinación o rectoría).");
      pasos.push("Presenta tu caso por escrito o de forma verbal dejando registro.");
      pasos.push("Sigue el conducto regular hasta obtener respuesta.");
    }
  } else {
    // beneficio / norma
    if (esEst) {
      pasos.push("Lee el artículo completo y verifica si cumples los requisitos.");
      pasos.push("Consulta tus dudas con tu director de curso, orientación o coordinación.");
      pasos.push("Solicita el trámite o estímulo en la instancia indicada por el manual.");
    } else {
      pasos.push("Revisa el artículo y confirma los requisitos aplicables a tu caso.");
      pasos.push("Orienta al estudiante o acudiente sobre el conducto regular a seguir.");
      pasos.push("Registra la solicitud y da seguimiento conforme al manual.");
    }
  }

  return pasos.slice(0, 6);
}

/* ------------------------ Sugerencias contextuales --------------------- */

/* Aclaración permanente: todo lo que ofrece el asistente (pasos, tipo de
   falta y sugerencias) proviene solo del Manual de Convivencia. */
const NOTA_MANUAL =
  "Nota: estas orientaciones provienen únicamente del Manual de Convivencia del Colegio OEA I.E.D. " +
  "No sustituyen el debido proceso, la decisión de las instancias del colegio ni la atención profesional cuando sea necesaria.";

/* Sugerencias por problemática (tema detectado en la consulta), según rol.
   Redactadas con base en el manual (protocolos, Carta de Trato Digno,
   observatorio, comité de convivencia, Línea 123, etc.). */
const SUGERENCIAS_POR_TEMA = {
  suicida: {
    docente: [
      "Activa el mismo día el protocolo de protección de la vida y notifica a coordinación y al acudiente.",
      "Remite a orientación escolar; si el riesgo es inminente, contacta la Línea 123 y a la autoridad competente.",
    ],
    estudiante: [
      "Busca ayuda adulta de inmediato: un docente de confianza, orientación o coordinación. No lo guardes en silencio.",
      "En una emergencia, la Línea 123 atiende 24/7; tu acudiente y el colegio pueden acompañarte.",
    ],
  },
  acoso: {
    docente: [
      "Activa el protocolo de acoso escolar, registra el caso el mismo día y mantén la confidencialidad.",
      "Notifica a coordinación y a los acudientes, y remite a orientación para el seguimiento.",
    ],
    estudiante: [
      "Repórtalo ante orientación o coordinación: guardar silencio alarga la situación.",
      "Guarda pruebas (capturas, mensajes, testigos) y pide a tu acudiente acompañamiento en el proceso.",
    ],
  },
  sexual: {
    docente: [
      "Activa el protocolo de atención de acoso sexual con confidencialidad y no revictimización.",
      "Notifica a coordinación y, si aplica, a la autoridad competente; da seguimiento hasta el cierre.",
    ],
    estudiante: [
      "Repórtalo a orientación o coordinación: el colegio debe protegerte y tu información es confidencial.",
      "Pide a tu acudiente acompañarte; no es tu culpa y tienes derecho a ser escuchada/o.",
    ],
  },
  violencia: {
    docente: [
      "Garantiza la integridad de todos: separa situaciones, activa el protocolo y registra los hechos.",
      "Si hay armas o riesgo grave, contacta la Línea 123 y a la autoridad competente de inmediato.",
    ],
    estudiante: [
      "Aléjate del peligro y busca a un docente o al coordinador de inmediato.",
      "Cuéntale a tu acudiente lo ocurrido: el colegio debe activar el protocolo de protección.",
    ],
  },
  pelea: {
    docente: [
      "Separa a los involucrados, registra el hecho el mismo día y evalúa si es riña o falta grave.",
      "Notifica a coordinación y a los acudientes, y ofrece conciliación si el caso lo permite.",
    ],
    estudiante: [
      "No te quedes en el lugar de la riña y busca a un docente de inmediato.",
      "Si hubo golpes, preséntate a orientación para el registro y el seguimiento del caso.",
    ],
  },
  groserias: {
    docente: [
      "Recuerda la Carta de Trato Digno: acuerda con el estudiante la reparación (disculpa y compromiso).",
      "Registra la falta leve en el observatorio e informa al acudiente.",
    ],
    estudiante: [
      "Revisa la Carta de Trato Digno: respetar es un compromiso de toda la comunidad oeista.",
      "Si alguien te faltó al respeto, repórtalo con hechos y testigos a tu docente.",
    ],
  },
  hurto: {
    docente: [
      "Registra el caso, revisa pruebas disponibles y notifica a coordinación y a los acudientes.",
      "Si el perjuicio lo amerita, orienta a la familia sobre la denuncia ante la autoridad competente.",
    ],
    estudiante: [
      "Repórtalo de inmediato a tu docente o coordinación; no intentes resolverlo por tu cuenta.",
      "Pide a tu acudiente el acompañamiento para el registro y la recuperación de tus pertenencias.",
    ],
  },
  drogas: {
    docente: [
      "Activa el protocolo por consumo o porte de sustancias (falta gravísima) y remite a orientación.",
      "Notifica por escrito a coordinación y a los acudientes; da seguimiento hasta el cierre del caso.",
    ],
    estudiante: [
      "Consumir o portar sustancias en el colegio es falta gravísima: si necesitas ayuda, pídela a orientación.",
      "Si un compañero está en riesgo, informa a un adulto de confianza del colegio.",
    ],
  },
  celular: {
    docente: [
      "Aplica las reglas del manual sobre dispositivos y deja registro escrito de cualquier retención.",
      "Si se usa para grabar, difundir o agredir, evalúa si constituye falta grave o situación con protocolo.",
    ],
    estudiante: [
      "Revisa en el manual las reglas de uso del celular en el colegio antes de usarlo en clase.",
      "Si el docente lo retira, pide el registro de la entrega para reclamarlo después por el conducto regular.",
    ],
  },
  copiar: {
    docente: [
      "Verifica los hechos y aplica el debido proceso antes de decidir una sanción por fraude académico.",
      "Ofrece una segunda oportunidad de aprendizaje junto con la medida de reparación.",
    ],
    estudiante: [
      "Copiar un examen o trabajo es falta al honor académico: reconoce el hecho y asume la reparación.",
      "Antes de la evaluación, pide apoyo al docente en lugar de recurrir a la copia.",
    ],
  },
  vandalismo: {
    docente: [
      "Registra el daño con evidencia y define la reparación del perjuicio con el estudiante y su acudiente.",
      "Si el daño es grave, informa por escrito a coordinación de convivencia.",
    ],
    estudiante: [
      "Si causaste un daño, repártelo o compensa: el manual exige reparar el perjuicio.",
      "Si ves quién lo hizo, repórtalo a un docente; la reparación también reduce la sanción.",
    ],
  },
  internet: {
    docente: [
      "El ciberacoso o la difusión de contenido ofensivo se atiende con el protocolo correspondiente.",
      "Registra las pruebas digitales y remite a orientación; mantén la confidencialidad de los datos.",
    ],
    estudiante: [
      "No compartas ni respondas contenido que humille a otros: también es falta en línea.",
      "Si comparten algo tuyo o te acosan en redes, guarda capturas y repórtalo a un adulto del colegio.",
    ],
  },
  impuntualidad: {
    docente: [
      "Registra la tardanza en el observatorio e informa al acudiente cuando se convierta en reincidencia.",
      "Acuerda con el estudiante un plan de puntualidad antes de escalar la falta.",
    ],
    estudiante: [
      "Si llegas tarde, avisa a tu docente y justifica la ausencia con tu acudiente.",
      "Organiza tu ruta y hora de salida: la reincidencia en tardanzas se sanciona como falta leve.",
    ],
  },
  permiso: {
    docente: [
      "Verifica que la justificación venga del acudiente y regístrala en el observatorio.",
      "Informa al acudiente las faltas injustificadas reiteradas por escrito.",
    ],
    estudiante: [
      "Pide el permiso o la justificación por escrito con tu acudiente antes de faltar.",
      "Al regresar, radica la excusa en coordinación para que no quede como falta injustificada.",
    ],
  },
  conciliacion: {
    docente: [
      "Facilita la conciliación con reglas de diálogo y deja el acuerdo por escrito con firmas.",
      "Da seguimiento al acuerdo para verificar que el conflicto no se reincida.",
    ],
    estudiante: [
      "Pide la conciliación ante orientación o coordinación: el manual prioriza el diálogo y la reparación.",
      "Llega con disposición de escuchar y de cumplir el acuerdo que se firme.",
    ],
  },
  sancion: {
    docente: [
      "Toda sanción debe estar motivada, registrada y notificada al acudiente con firma.",
      "Si reincide, deja el antecedente por escrito: es lo que permite escalar la falta correctamente.",
    ],
    estudiante: [
      "Toda sanción se te debe informar con sus motivos; pregunta cuál es el procedimiento de revisión.",
      "Si no estás de acuerdo, presenta tu descargue por escrito ante coordinación.",
    ],
  },
  derechos: {
    docente: [
      "Informa a la comunidad los mecanismos de queja, petición y trato digno del manual.",
      "Registra cada solicitud recibida y responde por el conducto regular.",
    ],
    estudiante: [
      "Puedes presentar quejas o peticiones por escrito ante coordinación o rectoría, dejando radicación.",
      "El manual te garantiza trato digno y sin discriminación: exígelo y respétalo.",
    ],
  },
  beneficios: {
    docente: [
      "Informa a tiempo los requisitos y plazos de cada estímulo o beneficio del manual.",
      "Propón perfiles de estímulo para reconocer la buena convivencia del curso.",
    ],
    estudiante: [
      "Revisa los requisitos de cada estímulo y consulta con tu director de curso si cumples con ellos.",
      "Mantener buena convivencia y notas te hace acreedor a los reconocimientos del manual.",
    ],
  },
  uniforme: {
    docente: [
      "Verifica el incumplimiento con respeto y aplica la medida correspondiente, sin exponer al estudiante.",
      "Orienta al estudiante y a su acudiente sobre el reglamento de vestimenta y presentación.",
    ],
    estudiante: [
      "Revisa el artículo del uniforme en el manual y ajusta tu presentación personal antes de ingresar.",
      "Si tienes un caso especial, solicita la autorización por escrito a coordinación.",
    ],
  },
  notas: {
    docente: [
      "Informa por escrito a los acudientes el riesgo académico de cada estudiante a tiempo.",
      "Registra los acuerdos de acompañamiento (plan de mejoramiento) cuando las notas lo ameriten.",
    ],
    estudiante: [
      "Revisa tus notas con tu docente de curso y pregunta por el plan de mejoramiento si vas mal.",
      "Las notas y la promoción se rigen por el manual: confirma los requisitos antes del cierre.",
    ],
  },
  matricula: {
    docente: [
      "Verifica los requisitos de matrícula, reingreso o traslado y deja registro de la solicitud.",
      "Informa a las familias el cronograma y los documentos exigidos por el manual.",
    ],
    estudiante: [
      "Consulta en secretaría los requisitos y fechas de matrícula, reingreso o traslado.",
      "Ten listos los documentos del acudiente: son exigidos por el manual para la inscripción.",
    ],
  },
  protocolo: {
    docente: [
      "Identifica qué protocolo (tipo I, II o III) aplica y actívalo el mismo día del reporte.",
      "Documenta cada actuación: el seguimiento escrito es parte del debido proceso.",
    ],
    estudiante: [
      "Cuéntalo a un docente, al orientador o a coordinación: el colegio activa el protocolo que corresponda.",
      "Tu información será confidencial y tus datos estarán protegidos.",
    ],
  },
  trato: {
    docente: [
      "Revisa tu trato: el manual exige respeto y trato digno hacia los estudiantes; registra hechos, no impresiones.",
      "Si el estudiante siente trato injusto, escúchalo y acuerda con orientación un seguimiento objetivo.",
    ],
    estudiante: [
      "Si sientes que te tratan con injusticia o desprecio, pide una cita con orientación o coordinación y explica hechos concretos.",
      "Guarda fechas, testigos y lo ocurrido: el manual garantiza trato digno a toda la comunidad.",
    ],
  },
};

/* Sugerencias complementarias según la gravedad del artículo encontrado. */
const SUGERENCIAS_POR_CATEGORIA = {
  leve: {
    docente: ["Verifica que la medida de reparación sea concreta (disculpa, compensación o cambio) antes de cerrar el registro."],
    estudiante: ["Si no estás de acuerdo con la falta, explica tu versión antes de firmar el registro en el observatorio."],
  },
  grave: {
    docente: ["Informa por escrito a coordinación de convivencia y da seguimiento escrito hasta el cierre."],
    estudiante: ["Pide acompañamiento a tu acudiente: tienes derecho a la defensa ante coordinación."],
  },
  gravisima: {
    docente: ["Documenta cada actuación y activa el debido proceso con el comité de convivencia."],
    estudiante: ["Ejerce tu derecho a la defensa: da tu versión ante el comité con tu acudiente presente."],
  },
  situacion: {
    docente: ["Registra el caso con confidencialidad y activa el protocolo que corresponda."],
    estudiante: ["No te quedes en silencio: cuenta lo a un adulto de confianza del colegio."],
  },
  ruta: {
    docente: ["Deja registro escrito de cada solicitud y de su respuesta en el expediente del caso."],
    estudiante: ["Sigue el conducto regular (docente → coordinación → rectoría) dejando registro de cada paso."],
  },
  beneficio: {
    docente: ["Informa a la comunidad los requisitos y plazos de cada estímulo a tiempo."],
    estudiante: ["Verifica los requisitos y plazos con tu director de curso antes de postular."],
  },
  norma: {
    docente: ["Socializa la norma con el curso y déjala escrita en el acuerdo de aula."],
    estudiante: ["Ten en cuenta que las normas del manual aplican a toda la comunidad educativa."],
  },
};

/* Temas sensibles que deben considerarse primero al ordenar sugerencias. */
const TEMAS_PRIORITARIOS = new Set(["suicida", "acoso", "sexual", "violencia", "drogas"]);

/** Devuelve los ids de los temas (grupos de sinónimos) presentes en la consulta. */
function detectarTemas(query) {
  const base = tokens(query);
  const texto = normalizar(query);
  const encontrados = [];
  for (const g of GRUPOS) {
    const coincide = g.términos.some((t) => {
      const tn = normalizar(t);
      // Términos compuestos («no quiero vivir», «malas palabras»): se buscan
      // como frase dentro de la consulta completa.
      if (tn.includes(" ")) return texto.includes(tn);
      return base.some((p) => coincideTermino(p, tn));
    });
    if (coincide) encontrados.push(g.id);
  }
  return encontrados.sort(
    (a, b) => (TEMAS_PRIORITARIOS.has(b) ? 1 : 0) - (TEMAS_PRIORITARIOS.has(a) ? 1 : 0)
  );
}

/** Sugerencias de apoyo (máx. 3) según la problemática, el rol y la gravedad. */
function sugerenciasPara(query, item, rol) {
  const esDocente = rol === "docente";
  const lista = [];
  const empujar = (texto) => {
    if (texto && !lista.includes(texto) && lista.length < 3) lista.push(texto);
  };

  for (const id of detectarTemas(query)) {
    const reglas = SUGERENCIAS_POR_TEMA[id];
    if (!reglas) continue;
    for (const s of esDocente ? reglas.docente : reglas.estudiante) empujar(s);
    if (lista.length >= 3) break;
  }

  // Complemento según la gravedad del artículo que respondió la consulta.
  if (item && SUGERENCIAS_POR_CATEGORIA[item.categoria]) {
    const porCat = SUGERENCIAS_POR_CATEGORIA[item.categoria];
    for (const s of esDocente ? porCat.docente : porCat.estudiante) empujar(s);
  }

  return lista;
}

/** Otras consultas del manual relacionadas con la misma problemática. */
function relacionadas(query, item) {
  const semilla = item ? item.titulo : query;
  const candidatos = buscarItems(semilla, { limite: 8 })
    .map((r) => r.item)
    .filter((i) => !item || i.id !== item.id);
  const unicas = [];
  for (const i of candidatos) {
    if (!unicas.some((u) => u.id === i.id)) unicas.push(i);
    if (unicas.length >= 3) break;
  }
  return unicas.map((i) => ({
    pregunta: i.titulo,
    etiqueta: recortar(i.titulo.replace(/\s*…$/, ""), 66),
  }));
}

/* --------------------------- Encabezados ------------------------------- */

const ENCABEZADO = {
  leve: "Esto corresponde a una FALTA LEVE",
  grave: "Esto corresponde a una FALTA GRAVE",
  gravisima: "Esto corresponde a una FALTA GRAVÍSIMA",
  situacion: "Esto corresponde a una SITUACIÓN (se atiende con protocolo)",
  ruta: "Esto es una RUTA / PROCEDIMIENTO del manual",
  beneficio: "Esto corresponde a un BENEFICIO / ESTÍMULO del manual",
  norma: "Esto corresponde a una NORMA del manual",
};

function recortar(texto, n) {
  const t = String(texto || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, "").trim() + "…";
}

/* ------------------------------ Saludos -------------------------------- */

function respuestaSaludo(t) {
  if (/\b(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|que mas|que hay|q hay|que onda|q onda|que hubo|ola|hey|ey|saludos|buenas parce)\b/.test(t)) {
    return {
      texto:
        "¡Hola! Soy el asistente del Manual de Convivencia del Colegio OEA I.E.D.\n\n" +
        "Pregúntame por faltas, sanciones, protocolos, derechos y deberes, horarios, notas, matrícula o beneficios, y te daré la respuesta del manual paso a paso. Escribe tu consulta como la dirías a un profesor: con tus palabras está bien. Elige arriba si eres docente o estudiante para recibir indicaciones personalizadas.",
      articulo: null,
      pasos: [],
      sugerencias: [
        "Escribe tu consulta con tus palabras: «llego tarde», «pelearon», «me robaron el celular», «copiar un examen».",
        "Si me cuentas el tipo de situación, te indico la falta, los pasos a seguir y sugerencias según tu rol.",
      ],
      relacionadas: [],
      rol: null,
      nota: NOTA_MANUAL,
    };
  }
  if (/\b(gracias|grax|mil gracias|te lo agradezco|ty)\b/.test(t)) {
    return {
      texto: "¡Con gusto! Si necesitas revisar otro artículo del manual, aquí estaré.",
      articulo: null,
      pasos: [],
      sugerencias: [],
      relacionadas: [],
      rol: null,
      nota: NOTA_MANUAL,
    };
  }
  if (/\b(ayudame|ayuda|me puedes ayudar|me puede ayudar|necesito ayuda|tengo una duda|dime sobre|explicame sobre|que temas manejas|de que hablas|que sabes hacer|para que sirves|como funcionas|quien eres|que eres|que puedes hacer)\b/.test(t)) {
    return {
      texto:
        "¡Claro! Soy el chatbot del Manual de Convivencia del Colegio OEA I.E.D.\n\n" +
        "Puedo ayudarte con lo que dice el manual: faltas y sanciones (leve, grave, gravísima), situaciones y protocolos, derechos y deberes, horarios y uniforme, notas y promoción, matrícula, conciliación escolar, beneficios y estímulos, y correctivos pedagógicos.\n\n" +
        "Cuéntame tu situación con tus palabras y te doy la respuesta del manual, los pasos a seguir y sugerencias, todo según el manual y según seas docente o estudiante.",
      articulo: null,
      pasos: [],
      sugerencias: [
        "«¿Qué pasa si llego tarde varias veces?»",
        "«Un compañero me insultó, ¿qué hago?»",
        "«¿Cómo denuncio un acoso?»",
      ],
      relacionadas: [],
      rol: null,
      nota: NOTA_MANUAL,
    };
  }
  return null;
}

/* -------------------------- Groserías: respuesta ----------------------- */

function respuestaGroseria() {
  return {
    texto:
      "Entiendo que puedas estar molesto o molesta, pero aquí hablamos con respeto.\n\n" +
      "El Manual de Convivencia establece que emplear vocabulario inadecuado, palabras vulgares y descomedidas es una FALTA LEVE (Eje Conviviendo), y que irrespetar con vocabulario soez a los miembros de la comunidad educativa puede constituir una falta GRAVÍSIMA. La Carta de Trato Digno obliga a toda la comunidad oeista a tratar con respeto y sin discriminación.\n\n" +
        "Te invito a reformular tu consulta sin groserías y con gusto te ayudaré con el tema del manual que necesites.",
    articulo: null,
    pasos: [
      "Vuelve a escribir tu consulta con un lenguaje respetuoso.",
      "Si algo te molestó en el colegio, repórtalo a tu docente, orientación o coordinación por el conducto regular.",
    ],
    sugerencias: [
      "Reformula tu consulta sin groserías y te ayudo con el artículo del manual que necesites.",
      "Si la falta de respeto la sufriste tú, cuéntamelo («me faltó al respeto un compañero») y te doy el paso a paso para reportarlo.",
    ],
    relacionadas: [],
    rol: null,
    nota: NOTA_MANUAL,
  };
}

/* --------------------- Crisis: atención prioritaria --------------------- */

function respuestaCrisis() {
  return {
    texto:
      "Lo que describes suena urgente y no debes enfrentarlo solo/a.\n\n" +
      "Si estás pensando en hacerte daño, busca ayuda adulta de inmediato: un docente de confianza, al orientador o a coordinación. En una emergencia, la Línea 123 atiende 24/7. El Manual de Convivencia del Colegio OEA I.E.D. obliga a la comunidad a proteger la vida y el bienestar de sus integrantes, y el colegio activará el protocolo correspondiente contigo y tu acudiente.\n\n" +
      "Cuéntame si ya estás con un adulto del colegio, y con gusto te indico los pasos del manual para este caso.",
    articulo: null,
    pasos: [
      "Habla ahora mismo con un adulto de confianza del colegio (docente, orientación o coordinación).",
      "En una emergencia llama la Línea 123: atiende las 24 horas.",
      "Permite que el colegio active el protocolo de protección y notifique a tu acudiente.",
    ],
    sugerencias: [
      "Si prefieres, cuéntamelo con otras palabras y te muestro el protocolo del manual para este caso.",
      "También puedo explicarte los canales del manual para pedir ayuda: orientación, coordinación o el comité de convivencia.",
    ],
    relacionadas: [],
    rol: null,
    nota: NOTA_MANUAL,
    rol: null,
  };
}

/* --------------------- Fuera del manual / sin match --------------------- */

function respuestaFueraDeManuel() {
  return {
    texto:
      "Esa consulta no hace parte del Manual de Convivencia del Colegio OEA I.E.D., y yo respondo únicamente con base en ese manual.\n\n" +
      "Puedo ayudarte con: faltas y sanciones, situaciones y protocolos, derechos y deberes, horarios y uniforme, notas y promoción, matrícula, conciliación escolar, beneficios y estímulos, y correctivos pedagógicos.",
    articulo: null,
    pasos: [],
    sugerencias: [
      "Pregúntame por un tema del colegio: «¿qué pasa si llego tarde?», «¿cómo denuncio un acoso?», «¿cuáles son las sanciones por pelear?».",
      "Si tu duda es académica o personal, recuerda que mis respuestas cubren solo el manual de convivencia.",
    ],
    relacionadas: [],
    rol: null,
    nota: NOTA_MANUAL,
  };
}

function respuestaSinCoincidencia(query) {
  // Candidatas cercanas: si bien no hay coincidencia fuerte, se ofrecen
  // artículos del manual afin para que el usuario pueda elegir y afinar.
  const candidatas = query
    ? buscarItems(query, { limite: 3, minimo: 1.5 }).map((r) => ({
        pregunta: r.item.titulo,
        etiqueta: recortar(r.item.titulo.replace(/\s*…$/, ""), 66),
      }))
    : [];
  return {
    texto:
      "No encontré un artículo del manual que coincida exactamente con esa consulta.\n\n" +
      (candidatas.length
        ? "Tal vez te refieras a alguno de estos temas del manual (toca para verlo):\n"
        : "Prueba describiendo la situación con otras palabras (por ejemplo: «llegar tarde», «pelearon», «me robaron el celular», «copiar un examen», «notas», «uniforme»), o usa el apartado Buscar para explorar el manual completo."),
    articulo: null,
    pasos: [],
    sugerencias: [
      "Describe la situación con más detalle: quiénes participaron, qué pasó y cuándo.",
      "Usa palabras cercanas al manual: «falta», «sanción», «protocolo», «acudiente», «conciliación».",
    ],
    relacionadas: candidatas,
    nota: NOTA_MANUAL,
  };
}

/* ------------------------------- Principal ------------------------------ */

/**
 * @param {string} pregunta
 * @param {string|null} rol  "docente" | "estudiante" | null
 * @returns {Promise<{texto: string, articulo: object|null, pasos?: string[],
 *                    sugerencias?: string[], relacionadas?: object[], nota?: string,
 *                    rol?: string|null}>}
 */
async function responderPregunta(pregunta, rol = null) {
  const q = String(pregunta || "").trim().slice(0, 1000); // tope de longitud
  const t = normalizar(q);
  if (!q) return respuestaSinCoincidencia();

  // 0) Crisis (autolesión / suicidio): se atiende antes que cualquier otra
  //    detección, incluso si la consulta contiene groserías.
  if (detectarTemas(q).includes("suicida")) return respuestaCrisis();

  // 1) Groserías / faltas de respeto — salvo que el usuario sea la víctima
  //    ("me dijo groserías"), en cuyo caso se responde con el tema del manual.
  const victimaDeGroseria = /(me (dijo|dijeron|grito|gritaron|insulto|insultaron|falto|faltaron|trato|trataron)|nos (dijo|dijeron|insultaron|gritaron)|tratandome de)/.test(t);
  if (detectarGroseria(q).length && !victimaDeGroseria) return respuestaGroseria();

  // 2) Saludos y consultas meta. Solo cuentan si el mensaje es EXCLUSIVAMENTE
  //    saludo/ayuda: «q onda, me pueden ayudar con el celu?» tiene una consulta
  //    real y no debe devolver el mensaje de bienvenida.
  const saludo = respuestaSaludo(t);
  if (saludo && t.split(/\s+/).length <= 12) {
    const palabrasReales = t
      .replace(/\b(hola|holi|buenas|buenos|dias|tardes|noches|que|q|mas|hay|onda|hubo|ola|hey|ey|saludos|parce|gracias|grax|mil|te|lo|agradezco|ty|ayudame|ayuda|me|puedes|puede|necesito|tengo|una|duda|dime|sobre|explicame|temas|manejas|de|que|hablas|sabes|hacer|sirves|como|funcionas|quien|eres|puedes|tal|bien|papi|master|jefe|profe|mano)\b/g, " ")
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length > 2);
    if (palabrasReales.length === 0) return saludo;
  }

  // 3) Temas claramente ajenos al manual
  if (FUERA_FUERTE.some((re) => re.test(t))) return respuestaFueraDeManuel();

  const temas = detectarTemas(q);
  const posibleMatch = buscarItems(q, { limite: 1 });
  const puntajeMejor = posibleMatch.length ? posibleMatch[0].puntaje : 0;
  const esFuera = FUERA_DE_MANUAL.some((re) => re.test(t));

  // Consulta mixta: si el usuario toca un tema que SÍ está en el manual
  // («no hice la tarea de química» → tareas), se responde con el manual aunque
  // la consulta mencione algo ajenо. Si no hay ningún tema manual, lo ajeno
  // manda y se responde que está fuera de alcance.
  if (esFuera && temas.length === 0) return respuestaFueraDeManuel();

  // 4) Coincidencia: se exige una señal razonable. Un puntaje flojo sin ningún
  //    tema manual reconocible NO basta (evita respuestas al azar).
  const hayMatch = puntajeMejor >= 4 && (temas.length > 0 || puntajeMejor >= 7);
  if (!hayMatch) {
    if (puntajeMejor >= 3 && temas.length > 0) {
      // coincidencia débil pero con tema manual claro: se responde
    } else {
      return respuestaSinCoincidencia(q);
    }
  }

  const mejor = posibleMatch[0].item;
  const rolUsado = detectarRol(q, rol);
  const encabezado = ENCABEZADO[mejor.categoria] || "Esto corresponde a un artículo del manual";

  const texto =
    `${encabezado}\n\n` +
    `«${mejor.titulo}»${mejor.articulo ? " — " + mejor.articulo : ""}\n\n` +
    `${pasajeRelevante(mejor, q)}\n\n` +
    `Fuente: ${mejor.capituloTitulo || "Manual de Convivencia"}` +
      (mejor.seccionTitulo ? " › " + mejor.seccionTitulo : "");

  return {
    texto,
    articulo: mejor,
    pasos: pasosPorRol(mejor, rolUsado),
    sugerencias: sugerenciasPara(q, mejor, rolUsado),
    relacionadas: relacionadas(q, mejor),
    nota: NOTA_MANUAL,
    rol: rolUsado,
  };
}

module.exports = {
  responderPregunta,
  buscarItems,
  palabrasResaltar,
  normalizar,
  detectarGroseria,
  // expuestos solo para depuración / pruebas
  puntuar,
  expandir,
  sugerenciasPara,
  detectarTemas,
};
