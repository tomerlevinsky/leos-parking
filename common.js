/* LEOS guest parking — shared browser code for the three pages. */
(function () {
  const C = window.PARKING_CONFIG || {};
  const DEMO = !!C.DEMO;
  const sb = DEMO ? null : window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  const WD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  const pad = (n) => String(n).padStart(2, "0");
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

  // The parking runs on Israel time regardless of the visitor's device clock zone.
  function israelNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
  }
  function dateLabel(s, long) {
    const n = dayDiff(israelNow().day, s), d = parse(s);
    const base = `יום ${WD[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
    if (n === 0) return long ? "היום · " + base : "היום";
    if (n === 1) return long ? "מחר · " + base : "מחר";
    return base;
  }
  function fmtDur(min) {
    const h = min / 60;
    if (h === 1) return "שעה"; if (h === 2) return "שעתיים";
    return (Number.isInteger(h) ? h : h.toFixed(1)) + " שעות";
  }
  function fmtPlate(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
    return v || "";
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plateHTML = (p) => (p ? `<span class="plate" title="מספר רכב"><small>IL</small><span>${esc(fmtPlate(p))}</span></span>` : "");
  const fmtPhone = (p) => { const d = String(p || ""); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };

  function toast(t) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3800);
  }

  const MSG = {
    P_TAKEN: "החניה כבר תפוסה בחלק מהזמן הזה. נסו שעה אחרת או את החניה השנייה.",
    P_PENDING_EXISTS: "כבר יש הזמנה שממתינה לתשלום עם הטלפון או הרכב האלה. השלימו אותה, או חכו רבע שעה עד שתשתחרר.",
    P_DAY_OUT_OF_RANGE: "אי אפשר להזמין ליום הזה.",
    P_BAD_TIME: "השעות לא תקינות. בדקו את שעת ההתחלה והמשך.",
    P_PAST: "השעה הזאת כבר עברה.",
    P_BAD_PLATE: "מספר הרכב צריך להיות 7 או 8 ספרות.",
    P_BAD_PHONE: "מספר הטלפון לא תקין.",
    P_BAD_NAME: "חסר שם מלא.",
    P_BAD_CLIENT: "כתבו את שם הלקוח.",
    P_RENTALS_OFF: "ההשכרה סגורה כרגע.",
    P_NOT_STAFF: "החשבון הזה לא ברשימת העובדים. בקשו מתומר להוסיף אתכם.",
    P_NOT_ADMIN: "הפעולה הזאת שמורה למנהל המערכת.",
    P_NOT_ALLOWED: "אין לך הרשאה לפעולה הזאת.",
    P_BAD_EMAIL: "כתובת המייל לא תקינה.",
    P_SELF: "אי אפשר להסיר את עצמך.",
    PAY_NOT_CONFIGURED: "הסליקה עוד לא הוגדרה. פנו למשרד.",
    PAY_SIGN_FAILED: "לא הצלחנו לפתוח את עמוד התשלום. נסו שוב בעוד רגע.",
    EXPIRED: "זמן ההחזקה של ההזמנה עבר. הזמינו מחדש.",
    ALREADY_PAID: "ההזמנה הזאת כבר שולמה.",
  };
  function err(e) {
    const m = String((e && (e.message || e.error)) || e || "");
    const code = Object.keys(MSG).find((k) => m.includes(k));
    if (code) return MSG[code];
    if (/fetch|network/i.test(m)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
    return "משהו השתבש. נסו שוב.";
  }

  async function rpc(name, args) {
    if (DEMO) return window.PK_DEMO.rpc(name, args || {});
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw error;
    return data;
  }
  async function fn(name, body) {
    if (DEMO) return window.PK_DEMO.fn(name, body);
    let bearer = C.SUPABASE_KEY;
    try { const { data: { session } } = await sb.auth.getSession(); if (session) bearer = session.access_token; } catch {}
    const r = await fetch(`${C.SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.SUPABASE_KEY, Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.status) throw j;
    return j;
  }

  function renderDays(el, { from, n, sel, closedDays, onPick }) {
    let h = "";
    for (let i = 0; i < n; i++) {
      const s = addDays(from, i), d = parse(s);
      const top = i === 0 ? "היום" : i === 1 ? "מחר" : "יום " + WD[d.getUTCDay()];
      h += `<button type="button" class="day${closedDays && closedDays.has(s) ? " closed" : ""}" data-d="${s}" aria-pressed="${s === sel}"><b>${top}</b><span class="num">${d.getUTCDate()}.${d.getUTCMonth() + 1}</span></button>`;
    }
    el.innerHTML = h;
    el.onclick = (e) => { const b = e.target.closest(".day"); if (b) onPick(b.dataset.d); };
  }

  // blocks: [{spot,start,end,cls,title,sub,extra}]
  function renderBoard(el, { cfg, day, blocks, onEmpty }) {
    const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--H")) || 48;
    const O = cfg.open_min, Cl = cfg.close_min, height = ((Cl - O) / 60) * H;
    const now = israelNow();
    let hours = `<div class="hours" style="height:${height}px">`;
    for (let m = Math.ceil(O / 60) * 60; m < Cl; m += 60) if (m > O) hours += `<div class="num" style="top:${((m - O) / 60) * H}px">${hm(m)}</div>`;
    hours += "</div>";
    let lanes = "";
    for (const sp of [1, 2]) {
      let inner = "";
      if (day === now.day && now.min > O) {
        const y = (Math.min(now.min, Cl) - O) / 60 * H;
        inner += `<div class="pastshade" style="height:${y}px"></div>`;
        if (now.min < Cl) inner += `<div class="nowline" style="top:${y}px"></div>`;
      }
      for (const b of blocks.filter((x) => x.spot === sp || x.spot == null)) {
        const s = Math.max(b.start, O), e = Math.min(b.end, Cl);
        if (e <= s) continue;
        const top = ((s - O) / 60) * H, ht = Math.max(((e - s) / 60) * H - 3, 20);
        inner += `<div class="blk ${b.cls}" style="top:${top + 1}px;height:${ht}px" data-blk="${esc(b.id || "")}">
          <b>${b.title}</b><span class="num">${hm(b.start)}–${hm(b.end)}${b.sub ? " · " + b.sub : ""}</span>${ht > 62 && b.extra ? b.extra : ""}</div>`;
      }
      lanes += `<div class="lane" data-spot="${sp}" style="height:${height}px">${inner}</div>`;
    }
    el.innerHTML = hours + lanes;
    el.onclick = (e) => {
      if (e.target.closest("[data-blk]") || !onEmpty) return;
      const lane = e.target.closest(".lane"); if (!lane) return;
      const y = e.clientY - lane.getBoundingClientRect().top;
      onEmpty(Number(lane.dataset.spot), O + Math.floor((y / H) * 2) * 30);
    };
  }

  function renderNow(el, { cfg, blocks, label }) {
    const now = israelNow(); let h = "";
    for (const sp of [1, 2]) {
      const list = blocks.filter((b) => b.day === now.day && (b.spot === sp || b.spot == null));
      let pill, det = "";
      if (now.min < cfg.open_min || now.min >= cfg.close_min) { pill = '<span class="pill p-closed">מחוץ לשעות</span>'; det = `פעיל ${hm(cfg.open_min)}–${hm(cfg.close_min)}`; }
      else {
        const cur = list.find((b) => b.start <= now.min && now.min < b.end);
        if (cur) { pill = label(cur); det = "עד " + hm(cur.end); }
        else {
          const nx = list.filter((b) => b.start > now.min).sort((a, b) => a.start - b.start)[0];
          pill = '<span class="pill p-free">פנוי</span>'; det = nx ? "עד " + hm(nx.start) : "עד סוף היום";
        }
      }
      h += `<div class="spot${pill.includes("p-free") ? " is-free" : ""}"><div class="no">P</div><span class="lbl">חניית אורחים</span>${pill}<span class="det num">${det}</span></div>`;
    }
    el.innerHTML = h;
  }

  const isFree = (blocks, day, spot, s, e) => !blocks.some((b) => b.day === day && (b.spot === spot || b.spot == null) && b.start < e && s < b.end);

  function earliest(cfg, day) {
    const now = israelNow(); let s = cfg.open_min;
    if (day === now.day) s = Math.max(s, Math.ceil(now.min / 30) * 30);
    return s;
  }
  function fillStart(sel, { cfg, day, minLen, pref }) {
    const from = earliest(cfg, day), cur = pref ?? (sel.value === "" ? null : Number(sel.value));
    let h = "";
    for (let m = from; m + minLen <= cfg.close_min; m += 30) h += `<option value="${m}">${hm(m)}</option>`;
    sel.innerHTML = h || '<option value="">אין שעות פנויות</option>';
    if (cur != null) { const v = Math.max(from, cur); if ([...sel.options].some((o) => Number(o.value) === v)) sel.value = String(v); }
  }
  function fillDur(sel, { cfg, start, minLen, step }) {
    const prev = sel.value; let h = "";
    if (isNaN(start)) { sel.innerHTML = ""; return; }
    const rem = cfg.close_min - start;
    for (let d = minLen; d < rem; d += step) h += `<option value="${d}">${fmtDur(d)} · עד ${hm(start + d)}</option>`;
    if (rem >= minLen) h += `<option value="${rem}">עד סוף היום · ${hm(cfg.close_min)}</option>`;
    sel.innerHTML = h;
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  // Sign-in for staff and admin: one-time link by email (Supabase Auth).
  async function authGate(root, { need, onReady }) {
    if (DEMO) return onReady(await rpc("parking_me"));
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin(root);
    let me;
    try { me = await rpc("parking_me"); } catch (e) { return showMsg(root, err(e)); }
    if (!me.role || (need === "admin" && me.role !== "admin")) {
      return showMsg(root, need === "admin" ? `${esc(me.email)} אינו מנהל מערכת.` : `${esc(me.email)} לא נמצא ברשימת העובדים. בקשו מתומר להוסיף אתכם.`, true);
    }
    onReady(me);
  }
  function showLogin(root) {
    root.innerHTML = `<div class="center"><header class="top"><div class="brand"><div class="mark" aria-hidden="true">P</div><div><span class="eyebrow">לאוס מדיה ואינטראקטיב</span><h1>${esc(document.title.replace("חניון אורחים · ", "חניון אורחים – "))}</h1><p class="sub">כניסה עם המייל של העבודה</p></div></div></header>
      <section class="panel"><button class="primary" type="button" id="gBtn">כניסה עם חשבון Google של המשרד</button>
      <p class="note">בוחרים את חשבון ‎@leos.co.il‏ ונכנסים. רק מי שברשימת העובדים מקבל גישה.</p></section>
      <details class="panel"><summary class="note" style="cursor:pointer">אין גישה ל־Google? כניסה עם קישור במייל</summary>
      <form id="loginForm" class="stack" novalidate style="margin-top:12px"><div class="field"><label for="lEmail">מייל</label><input id="lEmail" class="ltr" type="email" autocomplete="email" inputmode="email" placeholder="name@leos.co.il" required></div>
      <button class="ghost" type="submit" id="lBtn" style="padding:12px">שליחת קישור כניסה</button><p class="note" id="lNote">נשלח אליך מייל עם קישור. לוחצים עליו ונכנסים, בלי סיסמה.</p></form></details></div>`;
    document.getElementById("gBtn").onclick = async () => {
      if (DEMO) return toast("תצוגה מקדימה: כאן נפתח חלון בחירת חשבון Google של המשרד");
      const b = document.getElementById("gBtn"); b.disabled = true; b.textContent = "מעביר ל־Google…";
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: location.origin + location.pathname,
        queryParams: { hd: C.GOOGLE_DOMAIN || "leos.co.il", prompt: "select_account" },
      } });
      if (error) { b.disabled = false; b.textContent = "כניסה עם חשבון Google של המשרד"; toast("הכניסה עם Google לא זמינה כרגע. נסו קישור במייל."); }
    };
    document.getElementById("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("lEmail").value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { document.getElementById("lNote").textContent = "כתובת המייל לא תקינה."; return; }
      if (DEMO) { document.getElementById("lNote").textContent = `תצוגה מקדימה: כאן נשלח קישור כניסה ל־${email}.`; return; }
      const btn = document.getElementById("lBtn"); btn.disabled = true; btn.textContent = "שולח…";
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      btn.disabled = false; btn.textContent = "שליחת קישור כניסה";
      document.getElementById("lNote").textContent = error ? "השליחה נכשלה. נסו שוב בעוד דקה." : `שלחנו קישור ל־${email}. פתחו את המייל בטלפון הזה ולחצו עליו.`;
    };
  }
  function showMsg(root, html, withLogout) {
    root.innerHTML = `<div class="center"><div class="panel warn-card"><h2>אין גישה</h2><p style="margin:0">${html}</p>${withLogout ? '<button class="ghost" id="lo">התנתקות</button>' : ""}</div></div>`;
    const lo = document.getElementById("lo"); if (lo) lo.onclick = logout;
  }
  async function logout() { if (DEMO) return toast("בתצוגה המקדימה אין התנתקות"); await sb.auth.signOut(); location.replace(location.pathname); }

  window.PK = { C, sb, DEMO, hm, ymd, parse, addDays, dayDiff, israelNow, dateLabel, fmtDur, fmtPlate, fmtPhone, esc, plateHTML, toast, err, rpc, fn,
    renderDays, renderBoard, renderNow, isFree, earliest, fillStart, fillDur, authGate, showLogin, logout };
})();
