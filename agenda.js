// Agenda de Marie + demandes de rendez-vous des clientes.
// Chargé par marie.html ; utilise window.MF (config.js) et window.MarieApp (marie.html).
(() => {
"use strict";
const { db, esc, fmtPhone } = MF;
const $ = (id) => document.getElementById(id);
const H_START = 8, H_END = 20, PX_PER_MIN = 0.8, SNAP = 15;
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const css = `
.ag-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ag-head h2{margin:0;font-weight:500;font-size:1.15rem;flex:1 1 160px;min-width:0}
.ag-mode{border:1px solid var(--gold);border-radius:12px;padding:12px 14px;background:linear-gradient(90deg,#9b1d5c44,#c76a3a22);display:flex;flex-direction:column;gap:10px}
.ag-mode p{margin:0}
.ag-scroll{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);border-radius:14px;background:var(--ink-2)}
.ag-grid{display:grid;grid-template-columns:44px repeat(7,minmax(92px,1fr));min-width:700px}
.ag-dayhead{position:sticky;top:0;padding:8px 6px;text-align:center;font-size:.78rem;color:var(--muted);border-bottom:1px solid var(--line);border-left:1px solid var(--line);background:var(--ink-2)}
.ag-dayhead b{display:block;font-size:1.05rem;color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.ag-dayhead.today b{color:var(--gold)}
.ag-corner{border-bottom:1px solid var(--line);position:sticky;left:0;z-index:5;background:var(--ink-2)}
.ag-hours{position:sticky;left:0;z-index:4;background:var(--ink-2)}
.ag-hours span{position:absolute;right:6px;transform:translateY(-50%);font-size:.68rem;color:var(--muted);font-variant-numeric:tabular-nums}
.ag-col{position:relative;border-left:1px solid var(--line);cursor:copy;
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 47px,var(--line) 47px,var(--line) 48px)}
.ag-col.today{background-color:#d9b25f0a}
.ag-col.past{background-color:#00000033;cursor:default}
.ag-now{position:absolute;left:0;right:0;height:2px;background:var(--rose);z-index:3;pointer-events:none}
.ag-ev{position:absolute;left:3px;right:3px;border-radius:8px;padding:3px 6px;font-size:.72rem;line-height:1.25;overflow:hidden;z-index:2;cursor:pointer;text-align:left;border:1px solid transparent;color:var(--ink)}
.ag-ev b{display:block;font-weight:600;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag-ev.rdv{background:var(--gold)}
.ag-ev.blocked{background:repeating-linear-gradient(135deg,#3a2b3a,#3a2b3a 6px,#2a1f2b 6px,#2a1f2b 12px);color:var(--muted);border-color:var(--line)}
.ag-ev.hold{background:#c8336f33;border:1px dashed var(--rose);color:var(--text)}
.ag-ev.pick{background:#d9b25f26;border:2px dashed var(--gold);color:var(--text)}
.ag-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;color:var(--muted)}
.ag-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px}
.rq-list{display:flex;flex-direction:column;gap:14px}
.rq{background:var(--ink-2);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
.rq.pending{border-color:var(--gold-soft)}
.rq-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.rq-top b{font-size:1.05rem;font-weight:500}
.rq-state{font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;white-space:nowrap}
.rq-state.pending{background:linear-gradient(90deg,var(--plum),var(--rose));color:#fff}
.rq-state.proposed{border:1px solid var(--gold-soft);color:var(--gold)}
.rq p{margin:0}
.rq .slots{display:flex;flex-direction:column;gap:4px;font-size:.92rem}
`;
const style = document.createElement("style"); style.textContent = css; document.head.append(style);

const A = { week: mondayOf(new Date()), appts: [], requests: [], mode: null, loaded: false, timer: null, sheet: null, warned: false };

function mondayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hm = (d) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
const dayLong = (d) => { const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d); return s.charAt(0).toUpperCase() + s.slice(1); };
const dur = (m) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`;
const SLOT_MIN = 120; // tous les rendez-vous durent 2 h
const pad = (n) => String(n).padStart(2, "0");
const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clientName = (r) => r.clients ? `${r.clients.first_name || ""} ${r.clients.last_name || ""}`.trim() : "Cliente";

/* ---------- Données ---------- */
async function load() {
  const from = A.week, to = addDays(A.week, 7);
  const [a, r] = await Promise.all([
    db.from("appointments").select("*").eq("status", "confirmed").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()).order("starts_at"),
    db.from("appointment_requests").select("*, clients(first_name,last_name,phone)").in("status", ["pending", "proposed"]).order("created_at")
  ]);
  if (!a.error) A.appts = a.data;
  if (!r.error) A.requests = r.data;
  A.loaded = true;
  badge();
}
function badge() {
  const n = A.requests.filter((r) => r.status === "pending").length;
  $("req-badge").textContent = n; $("req-badge").hidden = !n;
}
async function reload() { await load(); render(); }

/* ---------- Événements affichés ---------- */
function events() {
  const ev = [];
  for (const a of A.appts) ev.push({ kind: a.kind === "blocked" ? "blocked" : "rdv", start: new Date(a.starts_at), end: new Date(a.ends_at), title: a.kind === "blocked" ? (a.notes || "Indisponible") : (a.client_name || "Rendez-vous"), sub: "", id: a.id });
  for (const r of A.requests) if (r.status === "proposed" && (!A.mode || A.mode.requestId !== r.id))
    (r.proposals || []).forEach((p, i) => ev.push({ kind: "hold", start: new Date(p.start), end: new Date(p.end), title: `Proposé · ${clientName(r)}`, sub: "", reqId: r.id }));
  if (A.mode) A.mode.picks.forEach((p, i) => ev.push({ kind: "pick", start: p.start, end: p.end, title: `Proposition ${i + 1}`, sub: "fin " + hm(p.end), pick: i }));
  return ev;
}
function overlaps(start, end, ignoreId) {
  return A.appts.find((a) => a.id !== ignoreId && new Date(a.starts_at) < end && new Date(a.ends_at) > start);
}

/* ---------- Agenda ---------- */
function render() {
  if (!$("p-agenda").hidden) renderAgenda();
  if (!$("p-requests").hidden) renderRequests();
}
function renderAgenda() {
  const now = new Date(), ev = events();
  let hStart = H_START, hEnd = H_END;
  for (const e of ev) { hStart = Math.min(hStart, e.start.getHours()); hEnd = Math.max(hEnd, Math.ceil(e.end.getHours() + e.end.getMinutes() / 60)); }
  hEnd = Math.min(24, hEnd);
  const height = (hEnd - hStart) * 60 * PX_PER_MIN;
  const last = addDays(A.week, 6);
  const label = `${A.week.getDate()} ${A.week.getMonth() !== last.getMonth() ? new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(A.week) + " " : ""}– ${last.getDate()} ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(last)}`;

  let mode = "";
  if (A.mode) {
    const r = A.requests.find((x) => x.id === A.mode.requestId);
    mode = `<div class="ag-mode"><p><b>Proposer des créneaux de 2 h à ${esc(clientName(r))}</b></p>${r.message ? `<p class="note">Son message : « ${esc(r.message)} »</p>` : ""}
      <p class="note">Ses préférences : ${esc(r.preferences || "—")}${r.client_note ? ` · « ${esc(r.client_note)} »` : ""}</p>
      <p class="note">Touchez une case libre pour ajouter un créneau (3 maximum). Touchez une proposition pour la retirer. ${A.mode.picks.length}/3 choisi${A.mode.picks.length > 1 ? "s" : ""}.</p>
      <label>Petit mot pour la cliente (facultatif)<input class="field" id="ag-note" maxlength="300" value="${esc(A.mode.note || "")}" placeholder="Ex. : Je peux aussi vous prendre samedi matin."></label>
      <div class="actions"><button class="btn solid" type="button" data-ag="send" ${A.mode.picks.length ? "" : "disabled"}>Envoyer la proposition</button><button class="btn ghost" type="button" data-ag="mode-cancel">Annuler</button></div></div>`;
  }

  let grid = `<div class="ag-corner"></div>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(A.week, i);
    grid += `<div class="ag-dayhead${sameDay(d, now) ? " today" : ""}">${DAYS[i]}<b>${d.getDate()}</b></div>`;
  }
  let hours = "";
  for (let h = hStart; h <= hEnd; h++) hours += `<span style="top:${(h - hStart) * 60 * PX_PER_MIN}px">${h}h</span>`;
  grid += `<div class="ag-hours" style="height:${height}px">${hours}</div>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(A.week, i), dayEnd = addDays(d, 1);
    const isPast = dayEnd <= now;
    let inner = "";
    if (sameDay(d, now)) {
      const m = (now.getHours() - hStart) * 60 + now.getMinutes();
      if (m >= 0 && m <= (hEnd - hStart) * 60) inner += `<div class="ag-now" style="top:${m * PX_PER_MIN}px"></div>`;
    }
    for (const e of ev) {
      if (!(e.start < dayEnd && e.end > d)) continue;
      const s = Math.max(e.start, d), f = Math.min(e.end, dayEnd);
      const top = ((s - d) / 60000 - hStart * 60) * PX_PER_MIN, h = Math.max(18, (f - s) / 60000 * PX_PER_MIN - 2);
      const attrs = e.id ? `data-appt="${esc(e.id)}"` : e.reqId ? `data-req="${esc(e.reqId)}"` : `data-pick="${e.pick}"`;
      inner += `<button type="button" class="ag-ev ${e.kind}" style="top:${top}px;height:${h}px" ${attrs}><b>${esc(e.title)}</b>${esc(hm(e.start))}${e.sub ? " · " + esc(e.sub) : ""}</button>`;
    }
    grid += `<div class="ag-col${sameDay(d, now) ? " today" : ""}${isPast ? " past" : ""}" style="height:${height}px" data-day="${i}" data-h0="${hStart}">${inner}</div>`;
  }

  $("p-agenda").innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
    ${mode}
    <div class="ag-head">
      <button class="btn ghost small" type="button" data-ag="prev" aria-label="Semaine précédente">‹</button>
      <h2>${esc(label)}</h2>
      <button class="btn ghost small" type="button" data-ag="next" aria-label="Semaine suivante">›</button>
      <button class="btn ghost small" type="button" data-ag="today">Aujourd'hui</button>
      ${A.mode ? "" : `<button class="btn solid small" type="button" data-ag="new">+ Rendez-vous</button><button class="btn small" type="button" data-ag="block">Bloquer un créneau</button>`}
    </div>
    <div class="ag-scroll" id="ag-scroll"><div class="ag-grid">${grid}</div></div>
    <div class="ag-legend"><span><i style="background:var(--gold)"></i>Rendez-vous</span><span><i style="background:#c8336f33;border:1px dashed var(--rose)"></i>Proposé, en attente de la cliente</span><span><i style="background:#3a2b3a"></i>Indisponible</span><span>Touchez une case vide pour ajouter.</span></div>
  </div>`;
  // Sur téléphone, faire défiler jusqu'au jour courant
  const sc = $("ag-scroll"), today = sc.querySelector(".ag-col.today");
  if (today && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, today.offsetLeft - 44);
}

$("p-agenda").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ag],[data-appt],[data-req],[data-pick]");
  if (b) {
    if (b.dataset.ag === "prev") { A.week = addDays(A.week, -7); return reload(); }
    if (b.dataset.ag === "next") { A.week = addDays(A.week, 7); return reload(); }
    if (b.dataset.ag === "today") { A.week = mondayOf(new Date()); return reload(); }
    if (b.dataset.ag === "new") return openAppt({ start: nextSlot() });
    if (b.dataset.ag === "block") return openAppt({ start: nextSlot(), kind: "blocked" });
    if (b.dataset.ag === "mode-cancel") { A.mode = null; return render(); }
    if (b.dataset.ag === "send") return sendProposal(b);
    if (b.dataset.pick != null) { A.mode.note = $("ag-note").value; A.mode.picks.splice(Number(b.dataset.pick), 1); return render(); }
    if (b.dataset.appt) return openAppt({ id: b.dataset.appt });
    if (b.dataset.req) { MarieApp.nav("requests"); return; }
    return;
  }
  const col = e.target.closest(".ag-col");
  if (!col || col.classList.contains("past")) return;
  const rect = col.getBoundingClientRect();
  const mins = Math.floor(((e.clientY - rect.top) / PX_PER_MIN) / SNAP) * SNAP + Number(col.dataset.h0) * 60;
  const start = addDays(A.week, Number(col.dataset.day)); start.setHours(0, mins, 0, 0);
  if (A.mode) return addPick(start);
  openAppt({ start });
});
function nextSlot() { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0); if (d.getHours() < H_START) d.setHours(H_START, 0); return d; }

/* ---------- Propositions ---------- */
function startProposal(reqId) {
  const r = A.requests.find((x) => x.id === reqId); if (!r) return;
  A.mode = { requestId: reqId, picks: (r.status === "proposed" ? r.proposals : []).map((p) => ({ start: new Date(p.start), end: new Date(p.end) })).filter((p) => p.start > new Date()), note: r.marie_note || "" };
  MarieApp.nav("agenda");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function addPick(start) {
  const r = A.requests.find((x) => x.id === A.mode.requestId);
  A.mode.note = $("ag-note") ? $("ag-note").value : A.mode.note;
  if (start < new Date()) return MF.toast("Ce créneau est déjà passé.");
  if (A.mode.picks.length >= 3) return MF.toast("3 créneaux maximum. Retirez-en un pour en ajouter un autre.");
  const end = new Date(start.getTime() + SLOT_MIN * 60000);
  const clash = overlaps(start, end);
  if (clash) return MF.toast(`Occupé : ${clash.kind === "blocked" ? "indisponible" : clash.client_name} à ${hm(new Date(clash.starts_at))}`);
  if (A.mode.picks.some((p) => p.start < end && p.end > start)) return MF.toast("Ce créneau chevauche une autre proposition.");
  A.mode.picks.push({ start, end });
  A.mode.picks.sort((a, b) => a.start - b.start);
  render();
}
async function sendProposal(btn) {
  btn.disabled = true;
  const note = $("ag-note").value.trim();
  const { error } = await db.from("appointment_requests").update({
    status: "proposed", marie_note: note, updated_at: new Date().toISOString(),
    proposals: A.mode.picks.map((p) => ({ start: p.start.toISOString(), end: p.end.toISOString() }))
  }).eq("id", A.mode.requestId);
  if (error) { btn.disabled = false; return MF.toast("Envoi impossible. Réessayez."); }
  A.mode = null;
  MF.toast("Proposition envoyée : la cliente la verra sur sa carte");
  reload();
}

/* ---------- Fiche rendez-vous (créer / modifier) ---------- */
function openAppt({ id, start, kind, clientId }) {
  const a = id ? A.appts.find((x) => x.id === id) : null;
  const k = a ? a.kind : (kind || "rdv");
  const s = a ? new Date(a.starts_at) : start;
  const minutes = a ? Math.round((new Date(a.ends_at) - s) / 60000) : (k === "blocked" ? 60 : SLOT_MIN);
  const clients = [...MarieApp.S.clients.values()].sort((x, y) => MarieApp.fullName(x).localeCompare(MarieApp.fullName(y), "fr"));
  const selClient = a ? a.client_id : clientId;
  A.sheet = { id: a?.id, kind: k, confirming: false }; A.warned = false;
  const body = `<form id="appt-form" novalidate>
    ${k === "rdv" ? `
      <label>Cliente<select class="field" id="ap-client"><option value="">— Autre personne (nom libre) —</option>${clients.map((c) => `<option value="${esc(c.id)}" ${c.id === selClient ? "selected" : ""}>${esc(MarieApp.fullName(c))} · ${esc(fmtPhone(c.phone))}</option>`).join("")}</select></label>
      <label id="ap-name-wrap" ${selClient ? "hidden" : ""}>Nom<input class="field" id="ap-name" maxlength="120" value="${esc(a && !a.client_id ? a.client_name : "")}"></label>`
      : `<label>Motif (facultatif)<input class="field" id="ap-reason" maxlength="120" value="${esc(a ? a.notes : "")}" placeholder="Pause, formation, congé…"></label>`}
    <div class="two">
      <label>Date<input class="field" id="ap-date" type="date" value="${dateInput(s)}"></label>
      <label>Heure<input class="field" id="ap-time" type="time" step="900" value="${timeInput(s)}"></label>
    </div>
    ${k === "blocked" ? `<label>Durée (minutes)<input class="field" id="ap-min" type="number" min="15" max="720" step="15" value="${minutes}"></label>` : `<p class="note" style="margin:0">Durée : 2 h</p>`}
    ${k === "rdv" ? `<label>Notes<textarea class="field" id="ap-notes" maxlength="500">${esc(a ? a.notes : "")}</textarea></label>` : ""}
    <p class="err" id="ap-err" hidden></p>
    <div class="actions"><button class="btn solid" type="submit">${a ? "Enregistrer" : k === "blocked" ? "Bloquer ce créneau" : "Ajouter le rendez-vous"}</button>
    ${a && a.client_id ? `<button class="btn" type="button" data-ap="card">Voir sa carte</button>` : ""}</div>
    ${a ? `<div id="ap-del"><button class="btn danger small" type="button" data-ap="del">${k === "blocked" ? "Débloquer" : "Annuler le rendez-vous"}</button></div>` : ""}
  </form>`;
  const title = a ? (k === "blocked" ? "Créneau indisponible" : "Rendez-vous") : (k === "blocked" ? "Bloquer un créneau" : "Nouveau rendez-vous");
  $("agenda-layer").innerHTML = `<div class="scrim" id="ag-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}${a ? `<span class="sub">${esc(dayLong(s))} · ${esc(hm(s))}</span>` : ""}</h2><button class="x" type="button" data-ap="close" aria-label="Fermer">×</button></div>${body}</div></div>`;
  const cs = $("ap-client");
  if (cs) cs.onchange = () => { $("ap-name-wrap").hidden = !!cs.value; };
}
function closeAppt() { A.sheet = null; $("agenda-layer").innerHTML = ""; }

$("agenda-layer").addEventListener("click", async (e) => {
  if (e.target.id === "ag-scrim") return closeAppt();
  const b = e.target.closest("[data-ap]"); if (!b) return;
  const act = b.dataset.ap, a = A.appts.find((x) => x.id === A.sheet?.id);
  if (act === "close") return closeAppt();
  if (act === "card") { closeAppt(); MarieApp.nav("cards"); MarieApp.openClient(a.client_id); return; }
  if (act === "del") {
    $("ap-del").innerHTML = `<div class="confirm"><p>${a.kind === "blocked" ? "Libérer ce créneau ?" : `Annuler le rendez-vous de ${esc(a.client_name)} ? Pensez à la prévenir.`}</p>
      <div class="actions"><button class="btn danger" type="button" data-ap="del-yes">${a.kind === "blocked" ? "Libérer" : "Annuler le rendez-vous"}</button><button class="btn ghost" type="button" data-ap="del-no">Garder</button></div></div>`;
    return;
  }
  if (act === "del-no") { $("ap-del").innerHTML = `<button class="btn danger small" type="button" data-ap="del">${a.kind === "blocked" ? "Débloquer" : "Annuler le rendez-vous"}</button>`; return; }
  if (act === "del-yes") {
    const { error } = await db.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
    if (error) return MF.toast("Annulation impossible. Réessayez.");
    closeAppt(); MF.toast(a.kind === "blocked" ? "Créneau libéré" : "Rendez-vous annulé"); reload();
  }
});
$("agenda-layer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("ap-err"), bad = (m) => { err.textContent = m; err.hidden = false; };
  const k = A.sheet.kind;
  const [y, mo, d] = ($("ap-date").value || "").split("-").map(Number);
  const [hh, mm] = ($("ap-time").value || "").split(":").map(Number);
  const minutes = k === "blocked" ? parseInt($("ap-min").value, 10) : SLOT_MIN;
  if (!y || isNaN(hh)) return bad("Indiquez la date et l'heure.");
  if (!(minutes >= 15 && minutes <= 720)) return bad("La durée doit être entre 15 minutes et 12 heures.");
  const start = new Date(y, mo - 1, d, hh, mm || 0), end = new Date(start.getTime() + minutes * 60000);
  const row = { starts_at: start.toISOString(), ends_at: end.toISOString(), kind: k };
  if (k === "rdv") {
    const cid = $("ap-client").value, c = cid ? MarieApp.S.clients.get(cid) : null;
    row.client_id = cid || null;
    row.client_name = c ? MarieApp.fullName(c) : $("ap-name").value.trim();
    if (!row.client_name) return bad("Choisissez une cliente ou indiquez un nom.");
    row.notes = $("ap-notes").value.trim();
  } else { row.notes = $("ap-reason").value.trim(); row.client_name = ""; row.service = ""; }
  const clash = overlaps(start, end, A.sheet.id);
  if (clash && !A.warned) { A.warned = true; return bad(`Attention : ce créneau chevauche « ${clash.kind === "blocked" ? (clash.notes || "Indisponible") : clash.client_name} » à ${hm(new Date(clash.starts_at))}. Appuyez de nouveau pour enregistrer quand même.`); }
  const q = A.sheet.id ? db.from("appointments").update(row).eq("id", A.sheet.id) : db.from("appointments").insert(row);
  const { error } = await q;
  if (error) return bad("Enregistrement impossible. Vérifiez les champs et réessayez.");
  const wasNew = !A.sheet.id;
  closeAppt();
  if (mondayOf(start).getTime() !== A.week.getTime()) A.week = mondayOf(start);
  MF.toast(wasNew ? (k === "blocked" ? "Créneau bloqué" : "Rendez-vous ajouté") : "Rendez-vous modifié");
  reload();
});

/* ---------- Demandes ---------- */
function renderRequests() {
  const pend = A.requests.filter((r) => r.status === "pending"), prop = A.requests.filter((r) => r.status === "proposed");
  const card = (r) => {
    const created = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(r.created_at));
    const slots = (r.proposals || []).map((p) => `<span>• ${esc(dayLong(new Date(p.start)))} à ${esc(hm(new Date(p.start)))}</span>`).join("");
    return `<article class="rq ${r.status}">
      <div class="rq-top"><span><b>${esc(clientName(r))}</b><br><span class="note">${esc(fmtPhone(r.clients?.phone))} · demandé le ${esc(created)}</span></span>
        <span class="rq-state ${r.status}">${r.status === "pending" ? "À traiter" : "Attend la cliente"}</span></div>
      <p class="note">Disponibilités : ${esc(r.preferences || "—")}</p>
      ${r.message ? `<p class="note">Message : « ${esc(r.message)} »</p>` : ""}
      ${r.client_note ? `<p class="note">Aucun créneau ne lui convenait : « ${esc(r.client_note)} »</p>` : ""}
      ${r.status === "proposed" ? `<div class="slots"><span class="note">Créneaux proposés :</span>${slots}</div>` : ""}
      <div id="rq-act-${esc(r.id)}" class="actions">
        <button class="btn solid small" type="button" data-rq="propose" data-id="${esc(r.id)}">${r.status === "pending" ? "Proposer des créneaux" : "Modifier la proposition"}</button>
        <button class="btn danger small" type="button" data-rq="refuse" data-id="${esc(r.id)}">Refuser</button>
      </div></article>`;
  };
  $("p-requests").innerHTML = `<div class="rq-list">
    ${!A.requests.length ? `<div class="empty"><strong>Aucune demande</strong>Les demandes de rendez-vous envoyées depuis les cartes des clientes apparaîtront ici.</div>` : ""}
    ${pend.length ? `<p class="section-label" style="margin:0">À traiter (${pend.length})</p>${pend.map(card).join("")}` : ""}
    ${prop.length ? `<p class="section-label" style="margin:8px 0 0">En attente de réponse (${prop.length})</p>${prop.map(card).join("")}` : ""}
  </div>`;
}
$("p-requests").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-rq]"); if (!b) return;
  const id = b.dataset.id, act = b.dataset.rq;
  if (act === "propose") return startProposal(id);
  if (act === "refuse") {
    $("rq-act-" + id).outerHTML = `<form class="confirm" data-refuse="${esc(id)}" novalidate><label>Petit mot pour la cliente (facultatif)<input class="field" maxlength="300" placeholder="Ex. : Je suis complète ce mois-ci, recontactez-moi en janvier."></label>
      <div class="actions"><button class="btn danger" type="submit">Refuser la demande</button><button class="btn ghost" type="button" data-rq="refuse-no">Retour</button></div></form>`;
    return;
  }
  if (act === "refuse-no") return renderRequests();
});
$("p-requests").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.closest("[data-refuse]"); if (!f) return;
  const { error } = await db.from("appointment_requests").update({ status: "refused", marie_note: f.querySelector("input").value.trim(), updated_at: new Date().toISOString() }).eq("id", f.dataset.refuse);
  if (error) return MF.toast("Enregistrement impossible. Réessayez.");
  MF.toast("Demande refusée"); reload();
});

/* ---------- Démarrage ---------- */
window.Agenda = {
  async start() {
    if (A.started) return; A.started = true;
    await load();
    clearInterval(A.timer);
    A.timer = setInterval(async () => { if (document.hidden || A.sheet) return; await load(); if (!A.mode) render(); }, 30000);
    let last = null; try { last = sessionStorage.getItem("mf-nav"); } catch {}
    if (last === "agenda" || last === "requests") MarieApp.nav(last);
  },
  show(which) { if (!A.loaded) return load().then(render); render(); },
  newFor(clientId) { MarieApp.nav("agenda"); openAppt({ start: nextSlot(), clientId }); }
};
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.sheet) closeAppt(); });
if (window.MarieApp && MarieApp.ready) window.Agenda.start();
})();
