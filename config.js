// Connexion à la base Supabase (clé publique : elle peut être dans le code, la sécurité est assurée par la base).
window.MF_CONFIG = {
  url: "https://rommwfibhucozktphmdv.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbW13ZmliaHVjb3prdHBobWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MTY3OTEsImV4cCI6MjExMTE5Mjc5MX0.PCHO04Eypz1bIffrfJkngDackYskT8lyxpZL2jQptkQ",
  // Adresse du site, déduite de la page ouverte (le QR code suit donc l'hébergement)
  siteUrl: new URL(".", location.href).href
};
window.MF = {
  db: window.supabase.createClient(window.MF_CONFIG.url, window.MF_CONFIG.key),
  esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  fmtPhone: (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, "$1 ") : (p || ""); },
  fmtDate: (iso) => { try { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return ""; } },
  fmtTime: (iso) => { try { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; } },
  nailSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M8 21V9.5a4 4 0 0 1 8 0V21"/><path d="M8.6 9.2c1-2.2 5.8-2.2 6.8 0"/><path d="M19 4.5v3M17.5 6h3M5 3.5v2M4 4.5h2"/></svg>',
  // Dessine la carte (valeurs échappées)
  cardHtml(c, goal, reward, pop = -1) {
    const n = Math.min(c.stamps || 0, goal);
    let stamps = "";
    for (let i = 0; i < goal; i++) {
      const on = i < n, last = i === goal - 1;
      stamps += `<div class="stamp${on ? " on" : ""}${last && !on ? " gift" : ""}${i === pop ? " pop" : ""}" aria-hidden="true">${on ? MF.nailSvg : last ? "♥" : i + 1}</div>`;
    }
    const cols = goal > 10 ? Math.ceil(goal / 2) : 5;
    const name = `${c.first_name || ""} ${c.last_name || ""}`.trim();
    const since = c.created_at ? `Cliente depuis ${new Date(c.created_at).getFullYear()}` : "";
    return `<div class="card" role="img" aria-label="Carte de ${MF.esc(name)} : ${n} passages sur ${goal}">
      <div class="card-top"><div class="card-title">Ma Folie et Moi<small>Prothésiste ongulaire depuis 2014</small></div>
      <div class="card-owner"><b>${MF.esc(name)}</b>${MF.esc(since)}</div></div>
      <div class="stamps" style="grid-template-columns:repeat(${cols},1fr)">${stamps}</div>
      <div class="card-foot"><span><b>${n}/${goal}</b> passages</span><span>${goal}ᵉ passage : ${MF.esc(reward)}</span></div></div>`;
  },
  // QR code en SVG (nécessite qrcode-generator)
  qrSvg(text) {
    const qr = qrcode(0, "M"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0d0a0c"/></svg>`;
  },
  // Lien sûr (https uniquement)
  safeUrl(u) { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } },
  // ---- Notifications push ----
  pushState() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (ios && !standalone) return "ios-install";          // sur iPhone : seulement depuis l'app installée
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    return Notification.permission;                        // "default" | "granted" | "denied"
  },
  async pushSubscription() {
    if (MF.pushState() !== "granted") return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  },
  async pushSubscribe() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("denied");
    const reg = await navigator.serviceWorker.ready;
    const { data: key, error } = await MF.db.rpc("push_public_key");
    if (error || !key) throw new Error("no_key");
    const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    const j = sub.toJSON();
    return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
  },
  async pushUnsubscribe() {
    const sub = await MF.pushSubscription();
    if (!sub) return;
    await MF.db.rpc("remove_push", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  },
  registerSW() { if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); },
  toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(MF._tt); MF._tt = setTimeout(() => (t.hidden = true), 2600);
  }
};
