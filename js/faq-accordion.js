/* faq-accordion.js — abre y cierra los <details data-faq-item> con animación de
   altura. Delegado en document, así funciona con markup que llega después.
   Sin JS el bloque sigue siendo usable: son <details> nativos. */

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.22,.61,.36,1)';

function expand(d, panel) {
  d.open = true;
  if (reduce()) return;
  const h = panel.scrollHeight;
  panel.animate(
    [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }],
    { duration: 420, easing: EASE }
  );
}

function collapse(d, panel) {
  if (reduce()) { d.open = false; return; }
  const h = panel.scrollHeight;
  const a = panel.animate(
    [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
    { duration: 320, easing: EASE }
  );
  a.onfinish = () => { d.open = false; };
}

document.addEventListener('click', e => {
  const s = e.target.closest && e.target.closest('summary');
  if (!s) return;
  const d = s.parentElement;
  if (!d || !d.matches('[data-faq-item]')) return;
  const panel = d.querySelector('[data-faq-panel]');
  if (!panel) return;
  e.preventDefault();

  if (d.open) { collapse(d, panel); return; }

  // un solo abierto por bloque
  const group = d.closest('[data-faq]');
  if (group) {
    group.querySelectorAll('[data-faq-item][open]').forEach(o => {
      if (o === d) return;
      const p = o.querySelector('[data-faq-panel]');
      if (p) collapse(o, p); else o.open = false;
    });
  }
  expand(d, panel);
});
