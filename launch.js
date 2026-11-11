/* launch.js — orquestração da landing e do modo log.
 *
 * Navegação sempre via location.href (NÃO replaceState), para que
 * document.referrer fique setado e o guard FROM_LANDING do jb-g.js
 * continue valendo.
 *
 * 3 estados:
 *   (sem params)          -> landing com countdown 3 s
 *   ?afterglow=run        -> import("./jb-g.js") e deixa ele rodar
 *   ?afterglow=done       -> pós-execução; volta pra landing sem re-rodar
 */

const params   = new URLSearchParams(location.search);
const isPS4    = /PlayStation 4/.test(navigator.userAgent);
const startBtn = document.getElementById("startBtn");
const hint     = document.getElementById("hint");

/* Perfil de heap LEVE — 16 drains de 16 KB em vez de 512×64 KB.
   mode=kpstep carrega o kpayload passo a passo (o mesmo do go.html original). */
const RUN_URL =
  "?afterglow=run&log=1&mode=kpstep&g=drain:16&g=drainsz:0x4000&v=1402s";

/* ---------- traduções das mensagens do jb-g.js ---------- */
new MutationObserver(() => {
  if (document.body.classList.contains("done"))
    sessionStorage.setItem("ag_done", "1");
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });

new MutationObserver(() => {
  const m = document.getElementById("msg");
  if (!m) return;
  const map = {
    "DONE":                           "✅ CONCLUÍDO\n\nReinicie o console para repetir.",
    "Restart your console":           "⚠️ REINICIE O CONSOLE",
    "Refresh the page and run again": "🔄 RECARREGUE A PÁGINA E TENTE DE NOVO"
  };
  const t = m.textContent.trim();
  if (map[t]) m.textContent = map[t];
}).observe(document.getElementById("msg"),
  { childList: true, characterData: true, subtree: true });

/* ---------- helpers de UI ---------- */
function landing(label, hintText, onClick) {
  startBtn.textContent = label;
  startBtn.disabled    = !onClick;
  startBtn.onclick     = onClick || null;
  hint.textContent     = hintText;
}

/* ---------- roteamento ---------- */
if (!isPS4) {
  landing("🚫 PS4 APENAS",
    "Abra esta página no navegador do PlayStation 4.", null);

} else if (params.get("afterglow") === "done") {
  /* SceShellUI reiniciou o WebProcess → browser restaurou esta URL.
     Marca como concluído e volta pra landing — não re-executa. */
  sessionStorage.setItem("ag_done", "1");
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  landing("✅ CONCLUÍDO",
    "Reinicie o console para uma nova execução.", null);

} else if (params.get("afterglow")) {
  /* Modo execução — jb-g.js lê ?afterglow e cuida de tudo. */
  document.body.className = "log";
  import("./jb-g.js?v=1402s").catch(e => {
    document.body.className = "fail";
    document.getElementById("msg").textContent = "❌ " + (e?.message || e);
  });

} else if (sessionStorage.getItem("ag_done") === "1") {
  landing("✅ JÁ RODOU NESTA SESSÃO",
    "Reinicie o console para repetir.",
    () => {
      sessionStorage.removeItem("ag_done");
      sessionStorage.removeItem("ag_started");
      location.href = RUN_URL;
    });

} else if (sessionStorage.getItem("ag_started") === "1") {
  landing("▶ TENTAR DE NOVO",
    "A tentativa anterior pode ter travado.",
    () => { location.href = RUN_URL; });

} else {
  /* Primeira execução — autostart 3 s; toque no botão pula o countdown. */
  sessionStorage.setItem("ag_started", "1");
  let n = 3;
  const launch = () => { location.href = RUN_URL; };
  landing("▶ INICIAR (" + n + ")", "Toque para começar agora.", launch);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); launch(); return; }
    startBtn.textContent = "▶ INICIAR (" + n + ")";
  }, 1000);
}