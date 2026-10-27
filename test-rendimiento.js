/* Medición de rendimiento del motor tras las mejoras. */
const ia = require("./backend/ia");
const qs = [
  "me excluyeron en el salon",
  "kiero sabr si prohiben el celu",
  "q hago con un man que me odia",
  "acoso en redes",
  "tardanzas",
  "copiar examen",
];
(async () => {
  await ia.responderPregunta("calentamiento"); // inicializa cachés
  const t0 = Date.now();
  let n = 0;
  for (let i = 0; i < 60; i++) {
    for (const q of qs) {
      await ia.responderPregunta(q, "estudiante");
      n++;
    }
  }
  const dt = Date.now() - t0;
  console.log(`${n} consultas en ${dt}ms (${(dt / n).toFixed(1)}ms/consulta)`);
})();
