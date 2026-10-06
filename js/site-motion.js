/* Lenguaje de motion TITA — Connect · Reveal · Transform · Follow · Expand
   Compartido por todas las páginas del sitio. */

const qa = s => Array.prototype.slice.call(document.querySelectorAll(s));
const q  = s => document.querySelector(s);

/* Header/footer en mobile (≤1080px): Soluciones siempre visible y footer sin desborde.
   Se inyecta aquí para cubrir las 7 páginas con dc-import y las generadas de /noticias/. */
const MOBILE_CHROME_CSS = `
@media(max-width:1080px){
#tm-dd{background:var(--tm-surface-quiet,#F2F4F3);margin:4px 0;padding:14px 16px 4px;width:100%;box-sizing:border-box}
#tm-ddbtn{pointer-events:none;cursor:default;font-family:'IBM Plex Mono',monospace!important;font-size:11.5px!important;letter-spacing:.14em;color:var(--tm-accent-ink,#17747C)!important;min-height:0!important;padding:0 0 10px!important;border-bottom:1px solid rgba(20,20,20,.12)!important}
#tm-ddbtn span{display:none}
#tm-ddbtn::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--tm-accent,#80E593);margin-right:2px}
#tm-drop{display:grid!important;gap:0!important;padding:0!important;box-shadow:none!important;background:transparent!important}
#tm-drop>a{padding:10px 0!important;border-bottom:1px solid rgba(20,20,20,.07)}
#tm-drop>a strong{font-size:15px!important;font-weight:500!important;margin-bottom:1px!important}#tm-drop>a span{font-size:12.5px!important;line-height:1.4!important}#tm-drop>a:last-of-type{border-bottom:0!important}
#tm-drop>div{display:none!important}
#tm-ftr-grid{grid-template-columns:minmax(0,1fr)!important}
#tm-ftr-grid>div:first-child>div{grid-template-columns:minmax(0,1fr)!important}
#tm-ftr-grid>div:first-child>div p{max-width:100%;overflow-wrap:anywhere}
}`;
if (typeof document !== 'undefined' && !document.getElementById('tm-mobile-chrome')) {
  const st = document.createElement('style');
  st.id = 'tm-mobile-chrome';
  st.textContent = MOBILE_CHROME_CSS;
  document.head.appendChild(st);
}

/* Las páginas pueden llamar initMotion más de una vez (componentDidUpdate corre antes de que
   resuelva el import y _stop aún es null). Sin desmontar la instancia previa los listeners se
   duplican y el toggle del menú se anula a sí mismo (abre y cierra en el mismo clic). */
let activeCleanup = null;

export function initMotion(opts = {}) {
  if (activeCleanup) { try { activeCleanup(); } catch (e) {} activeCleanup = null; }
  const off = [], timers = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, ev === 'scroll' || ev === 'mousemove' ? fn : fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
  const wait = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  const watchers = [];
  let pumpI = null, pumpOn = false;
  const pump = () => {
    const vh = window.innerHeight || 800;
    let pending = false;
    for (const w of watchers) {
      if (w.done) continue;
      const r = w.el.getBoundingClientRect();
      if (r.top < vh * (1 - w.m) && r.bottom > 0) { w.done = true; try { w.cb(); } catch (e) {} }
      else pending = true;
    }
    if (!pending && pumpI) { clearInterval(pumpI); pumpI = null; }
  };
  const watch = (el, cb, m) => { if (!el) return; watchers.push({ el, cb, m: m == null ? .12 : m, done: false }); pump(); };
  const startPump = () => {
    if (pumpOn) return;
    pumpOn = true;
    on(window, 'scroll', pump, { passive: true });
    on(window, 'resize', pump);
    pumpI = setInterval(pump, 220);
    off.push(() => { if (pumpI) clearInterval(pumpI); });
    requestAnimationFrame(pump);
  };

  const accent = opts.accent || '#80E593';
  const second = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  document.documentElement.style.setProperty('--tm-accent', accent);
  document.documentElement.style.setProperty('--tm-accent2', second);
  qa('input[type=checkbox]').forEach(i => { i.style.accentColor = accent; });

  const motion = opts.motion !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = q('#tm-root');
  if (root && motion) root.setAttribute('data-motion', '');

  /* ---- Reveal por líneas ---- */
  const heads = qa('[data-split]');
  // Muestra las líneas del título cuando entra en pantalla. Se registra en CADA initMotion (aunque el
  // título ya esté dividido): los watchers del init anterior se pierden al limpiar, y si la página se
  // vuelve a montar (componentDidUpdate) un título aún no visto quedaba oculto para siempre.
  const reveal = h => {
    watch(h, () => {
      h.querySelectorAll('[data-ln]').forEach(l => {
        l.setAttribute('data-in', '');
        const sp = l.firstElementChild;
        if (sp) sp.style.transform = 'none';
      });
    }, .10);
    startPump();
  };
  const build = h => {
    if (h.getAttribute('data-done') === null) {
      const words = (h.getAttribute('data-text') || h.textContent).trim().split(/\s+/);
      h.setAttribute('data-text', words.join(' '));
      h.textContent = '';
      const probes = words.map(w => {
        const s = document.createElement('span');
        s.textContent = w; s.style.display = 'inline-block';
        h.appendChild(s); h.appendChild(document.createTextNode(' '));
        return s;
      });
      const lines = []; let top = null;
      probes.forEach(s => {
        const t = Math.round(s.offsetTop);
        if (top === null || t > top + 2) { lines.push([]); top = t; }
        lines[lines.length - 1].push(s.textContent);
      });
      h.textContent = '';
      lines.forEach((ws, i) => {
        const outer = document.createElement('span');
        outer.setAttribute('data-ln', '');
        const inner = document.createElement('span');
        inner.textContent = ws.join(' ');
        inner.style.transitionDelay = (i * 95) + 'ms';
        outer.appendChild(inner); h.appendChild(outer);
      });
      h.setAttribute('data-done', '');
    }
    reveal(h);
  };
  if (!motion) heads.forEach(h => h.setAttribute('data-in', ''));
  else {
    const run = () => heads.forEach(build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run).catch(run);
    else wait(run, 120);
    let rt, lastW = window.innerWidth;
    on(window, 'resize', () => {
      if (window.innerWidth === lastW) return;   // solo cambia el alto (barra del navegador en móvil): los saltos de línea no cambian
      lastW = window.innerWidth;
      clearTimeout(rt);
      rt = setTimeout(() => {
        const shown = heads.filter(h => h.querySelector('[data-ln][data-in]'));
        heads.forEach(h => { h.removeAttribute('data-done'); h.textContent = h.getAttribute('data-text') || h.textContent; });
        heads.forEach(build);
        // lo que ya estaba visible se muestra de inmediato, sin volver a animar ni parpadear
        shown.forEach(h => h.querySelectorAll('[data-ln]').forEach(l => {
          l.setAttribute('data-in', '');
          const sp = l.firstElementChild;
          if (sp) { sp.style.transition = 'none'; sp.style.transform = 'none'; }
        }));
      }, 260);
    });
  }

  /* ---- Reveal por bloque ---- */
  const items = qa('[data-rv]');
  if (!motion) items.forEach(el => el.setAttribute('data-in', ''));
  else {
    let n = 0;
    items.forEach(el => watch(el, () => {
      wait(() => el.setAttribute('data-in', ''), Math.min(n++, 3) * 90);
      wait(() => { n = 0; }, 500);
    }));
    startPump();
  }

  /* ---- Header + barra de progreso ---- */
  const bar = q('#tm-prog'), hdr = q('#tm-hdr');
  let last = 0;
  if (hdr) hdr.style.transition = 'transform .45s cubic-bezier(.22,.61,.36,1), background .3s';
  const upd = () => {
    const y = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    if (hdr) {
      hdr.style.background = y > 40 ? 'rgba(255,255,255,.94)' : 'rgba(255,255,255,1)';
      const nav = q('#tm-nav');
      hdr.style.transform = (y > 220 && y > last && !(nav && nav.hasAttribute('data-open'))) ? 'translateY(-100%)' : 'none';
    }
    last = y;
  };
  on(window, 'scroll', upd, { passive: true });
  upd();

  /* ---- Navegación ---- */
  const dd = q('#tm-dd'), ddb = q('#tm-ddbtn'), drop = q('#tm-drop');
  const setDrop = open => { if (!drop) return; drop.style.display = open ? 'grid' : 'none'; ddb && ddb.setAttribute('aria-expanded', String(open)); };
  if (dd) {
    let dropT = null;
    on(dd, 'mouseenter', () => { clearTimeout(dropT); if (window.innerWidth > 1080) setDrop(true); });
    on(dd, 'mouseleave', () => {
      clearTimeout(dropT);
      if (window.innerWidth > 1080) dropT = setTimeout(() => setDrop(false), 240);
    });
    on(ddb, 'click', e => { e.preventDefault(); setDrop(drop.style.display !== 'grid'); });
  }
  const navEl = q('#tm-nav');
  on(q('#tm-burger'), 'click', () => {
    if (!navEl) return;
    navEl.hasAttribute('data-open') ? navEl.removeAttribute('data-open') : navEl.setAttribute('data-open', '');
  });
  qa('a[href^="#tm-"]').forEach(a => on(a, 'click', e => {
    const t = q(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    navEl && navEl.removeAttribute('data-open');
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  }));

  /* ---- Cursor contextual ---- */
  const cur = q('#tmcur'), lbl = q('#tmcur-l');
  if (cur) {
    if (opts.contextualCursor === false) cur.style.display = 'none';
    let x = 0, y = 0, tx = 0, ty = 0, raf = null;
    const loop = () => { x += (tx - x) * .2; y += (ty - y) * .2; cur.style.left = x + 'px'; cur.style.top = y + 'px'; raf = requestAnimationFrame(loop); };
    on(window, 'mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!raf) loop();
      if (opts.contextualCursor === false) return;
      const hit = e.target.closest && e.target.closest('[data-cursor]');
      if (hit) { lbl.textContent = hit.getAttribute('data-cursor'); cur.setAttribute('data-on', ''); }
      else cur.removeAttribute('data-on');
    }, { passive: true });
    off.push(() => { if (raf) cancelAnimationFrame(raf); });
  }

  /* ---- Follow: botones magnéticos ---- */
  if (motion) qa('[data-mag]').forEach(el => {
    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
    const tick = () => {
      cx += (tx - cx) * .18; cy += (ty - cy) * .18;
      el.style.transform = 'translate(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px)';
      if (Math.abs(tx - cx) > .15 || Math.abs(ty - cy) > .15) raf = requestAnimationFrame(tick); else raf = null;
    };
    on(window, 'mousemove', e => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const near = Math.abs(dx) < r.width / 2 + 70 && Math.abs(dy) < r.height / 2 + 50;
      tx = near ? Math.max(-11, Math.min(11, dx * .28)) : 0;
      ty = near ? Math.max(-8, Math.min(8, dy * .32)) : 0;
      el.style.transition = near ? 'transform .1s linear' : 'transform .5s cubic-bezier(.22,.61,.36,1)';
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    off.push(() => { if (raf) cancelAnimationFrame(raf); });
  });

  /* ---- 06 · Transición entre páginas ---- */
  const ov = q('#tm-trans'), ln = q('#tm-transline');
  if (ov && ln) qa('a[href="#"], a[href$=".html"]').forEach(a => on(a, 'click', e => {
    const href = a.getAttribute('href');
    const goes = href && href !== '#';
    if (goes && (e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank')) return;
    e.preventDefault();
    navEl && navEl.removeAttribute('data-open');
    drop && (drop.style.display = 'none');
    if (!motion) { if (goes) location.href = href; return; }
    ov.style.transition = 'opacity .28s ease'; ov.style.opacity = '1'; ov.style.pointerEvents = 'auto';
    wait(() => { ln.style.transition = 'width .55s cubic-bezier(.4,0,.2,1)'; ln.style.width = 'min(72vw,780px)'; }, 150);
    if (goes) { wait(() => { location.href = href; }, 640); return; }
    wait(() => { ov.style.opacity = '0'; ov.style.pointerEvents = 'none'; }, 1000);
    wait(() => { ln.style.transition = 'none'; ln.style.width = '0'; }, 1340);
  }));

  /* ---- Plan B: si las transiciones CSS no avanzan, mostrar todo ---- */
  // "Trabado" = con frames que SÍ se están pintando, el transform de una línea ya revelada no cambia
  // entre dos muestras tomadas dentro de requestAnimationFrame y separadas ≥ 250 ms (en NINGUNA línea: las que
  // esperan su transition-delay también se ven quietas). Antes bastaba con
  // "transform ≠ none", y eso también describe una transición en curso (título revelado hace <1 s) o
  // una página con el hilo principal ocupado (React/Babel/GTM): apagaba TODAS las animaciones según
  // la velocidad de carga, por eso los títulos animaban unas veces y otras no. Con la pestaña oculta
  // no se evalúa (las transiciones no avanzan); se reintenta al volver.
  if (motion && root) {
    const moving = t => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
    const sample = () => qa('[data-ln][data-in]').map(l => l.firstElementChild).filter(Boolean).map(sp => getComputedStyle(sp).transform);
    const frame = () => new Promise(r => requestAnimationFrame(t => r(t)));
    let dead = false; off.push(() => { dead = true; });
    const check = async () => {
      if (dead || document.visibilityState !== 'visible') return;
      const t1 = await frame(); if (dead) return;
      const a = sample();
      if (!a.some(moving)) return;
      await new Promise(r => wait(r, 300));
      const t2 = await frame(); if (dead || document.visibilityState !== 'visible') return;
      if (t2 - t1 < 250) return;                 // no hubo frames reales entre las dos muestras: no se puede concluir
      const b = sample();
      if (a.some((t, i) => b[i] !== t)) return;   // alguna línea avanzó (las demás pueden estar esperando su transition-delay): no está trabado
      root.removeAttribute('data-motion');
      qa('[data-ln] > span').forEach(sp => { sp.style.transition = 'none'; sp.style.transform = 'none'; });
      qa('[data-rv]').forEach(el => { el.setAttribute('data-in', ''); el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
    };
    wait(check, 1800);
    wait(check, 3600);
    on(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') wait(check, 1200); });
  }

  // Arrastre táctil de los sliders de logos (.tm-marq): módulo aparte, carga bajo demanda.
  let sliderOff = null, sliderDead = false;
  import('./logo-slider.js').then(m => { if (!sliderDead) sliderOff = m.initLogoSliders(); }).catch(() => {});
  off.push(() => { sliderDead = true; if (sliderOff) sliderOff(); });

  const cleanup = () => { timers.forEach(clearTimeout); off.forEach(f => f()); if (activeCleanup === cleanup) activeCleanup = null; };
  activeCleanup = cleanup;
  return cleanup;
}

/* ---- Expand: filas de capacidades ---- */
export function expandHandler(prefix) {
  return e => {
    const btn = e.currentTarget;
    const i = btn.getAttribute('data-sol');
    const panel = document.getElementById(prefix + i);
    if (!panel) return;
    const open = panel.getAttribute('data-open') !== null;
    const rows = qa('[data-sol]').map(b => b.parentElement);
    qa('[id^="' + prefix + '"]').forEach(p => { p.style.maxHeight = '0px'; p.removeAttribute('data-open'); });
    qa('[data-plus]').forEach(p => { p.style.transform = 'none'; });
    rows.forEach(r => { r.style.transition = 'opacity .4s ease'; r.style.opacity = '1'; });
    qa('[data-sol] > span:first-child').forEach(s => { s.style.transition = 'color .35s'; s.style.color = 'rgba(255,255,255,.62)'; });
    if (open) return;
    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.setAttribute('data-open', '');
    const plus = btn.querySelector('[data-plus]');
    if (plus) plus.style.transform = 'rotate(45deg)';
    const num = btn.querySelector('span:first-child');
    if (num) num.style.color = 'var(--tm-accent)';
    rows.forEach(r => { if (r !== btn.parentElement) r.style.opacity = '.42'; });
  };
}
