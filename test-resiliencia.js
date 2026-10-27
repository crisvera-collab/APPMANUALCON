/* Prueba de la resiliencia de frontend/script.js sin navegador. */
const fs = require("fs");
const vm = require("vm");

global.location = { protocol: "http:", hostname: "localhost", port: "3000", hash: "" };

let llamadas = 0;
let modo = "caido"; // caido | seRecupera

global.fetch = function () {
  llamadas++;
  if (modo === "caido") return Promise.reject(new TypeError("NetworkError"));
  if (llamadas < 3) return Promise.reject(new TypeError("NetworkError"));
  return Promise.resolve({
    ok: true,
    json: async () => ({ totalArticulos: 413, capitulos: [{}] }),
  });
};

vm.runInThisContext(
  fs.readFileSync(__dirname + "/frontend/script.js", "utf8"),
  { filename: "script.js" }
);

(async () => {
  // 1) Servidor caído del todo → debe reintentar 3 veces y fallar con el mensaje esperado
  llamadas = 0;
  modo = "caido";
  const t0 = Date.now();
  let msg = null;
  try {
    await apiJson("/api/manual/completo");
  } catch (e) {
    msg = e.message;
  }
  console.log("1) intentos =", llamadas, "| ms =", Date.now() - t0, "| error =", JSON.stringify(msg));
  if (llamadas !== 3) throw new Error("esperaba 3 intentos");
  if (!/^sin respuesta de /.test(msg || "")) throw new Error("mensaje de error inesperado");

  // 2) El servidor tarda en arrancar → se recupera sola sin error visible
  llamadas = 0;
  modo = "seRecupera";
  const data = await apiJson("/api/manual/completo");
  console.log("2) intentos =", llamadas, "| recuperado, artículos =", data.totalArticulos);
  if (llamadas !== 3) throw new Error("esperaba 3 intentos antes de recuperarse");

  // 3) Error HTTP 500 → no debe reintentar (no tiene sentido repetir)
  llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: false, status: 500 }; };
  let msg2 = null;
  try { await apiJson("/api/manual"); } catch (e) { msg2 = e.message; }
  console.log("3) intentos =", llamadas, "| error =", JSON.stringify(msg2));
  if (llamadas !== 1) throw new Error("no debe reintentar ante HTTP 500");

  console.log("\nTODAS LAS PRUEBAS PASARON");
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
