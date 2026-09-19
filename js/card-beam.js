/* Card Beam — un haz de luz barre la card y a su paso aparece una textura de código.
   El contenido real queda siempre por encima y legible; el código es decorativo. */

const LIB = [
  'const agente = await tita.agents.get("inventario");',
  'if (stock.disponible < umbral) agente.sugerir("reposicion");',
  'const pedidos = await erp.pedidos.pendientes({ canal: "marketplace" });',
  'catalogo.normalizar({ atributos, medidas, variantes });',
  'for (const tienda of tiendas) fulfillment.evaluar(tienda, pedido);',
  'const prediccion = modelo.demanda.forecast({ sku, semanas: 8 });',
  'conciliacion.detectar_excepciones(ordenes, pagos);',
  'pos.sincronizar(inventario, { intervalo: "5m" });',
  'function priorizar(casos) { return casos.sort(porImpacto); }',
  'await cloud.escalar({ picos: true, region: "us-east-1" });',
  'const autonomia = { consultar: true, ejecutar: false };',
  'trazabilidad.registrar(agente.id, decision, contexto);',
  'export const roadmap = casos.filter(viable).map(conBusinessCase);',
  'integraciones.conectar(["ERP","CRM","POS","WMS"]);',
  'analitica.medir({ trafico, conversion, ventas });',
  'const omnicanal = unificar(inventario, pedidos, logistica);',
];

function flow(cols, rows) {
  let s = '';
  const need = cols * rows + cols;
  while (s.length < need) s += LIB[(Math.random() * LIB.length) | 0] + '  ';
  let out = '';
  let off = (Math.random() * cols) | 0;
  for (let r = 0; r < rows; r++) {
    let line = s.slice(off, off + cols);
    if (line.length < cols) line += ' '.repeat(cols - line.length);
    out += line + (r < rows - 1 ? '\n' : '');
    off += cols;
  }
  return out;
}

export function initCardBeam(selector, opts = {}) {
  const cards = Array.prototype.slice.call(document.querySelectorAll(selector));
  if (!cards.length) return () => {};

  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const cleanup = [];

  cards.forEach(card => {
    if (card.dataset.beamReady) return;
    card.dataset.beamReady = '1';

    const cs = getComputedStyle(card);
    if (cs.position === 'static') card.style.position = 'relative';
    card.style.overflow = 'hidden';

    // solo el contenido real: nunca capas decorativas ya inyectadas
    Array.prototype.slice.call(card.children)
      .filter(ch => ch.getAttribute('aria-hidden') !== 'true')
      .forEach(ch => {
        if (getComputedStyle(ch).position === 'static') ch.style.position = 'relative';
        ch.style.zIndex = '1';
      });

    const ascii = document.createElement('pre');
    ascii.setAttribute('aria-hidden', 'true');
    ascii.style.cssText =
      'position:absolute;inset:0;margin:0;padding:0;z-index:0;pointer-events:none;' +
      "font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:13px;letter-spacing:0;" +
      'color:rgba(255,255,255,.13);white-space:pre;overflow:hidden;opacity:0;' +
      'clip-path:inset(0 100% 0 0);' +
      '-webkit-mask-image:linear-gradient(to right,rgba(0,0,0,.25) 0%,rgba(0,0,0,.7) 55%,rgba(0,0,0,1) 100%);' +
      'mask-image:linear-gradient(to right,rgba(0,0,0,.25) 0%,rgba(0,0,0,.7) 55%,rgba(0,0,0,1) 100%);';
    card.appendChild(ascii);

    const beam = document.createElement('div');
    beam.setAttribute('aria-hidden', 'true');
    beam.style.cssText =
      'position:absolute;top:0;bottom:0;left:0;width:2px;z-index:2;pointer-events:none;opacity:0;' +
      'background:linear-gradient(to bottom,transparent,#fff 12%,#fff 88%,transparent);' +
      'box-shadow:0 0 6px 1px ' + accent + ',0 0 18px 3px ' + accent2 + '66,0 0 40px 8px ' + accent + '26;';
    card.appendChild(beam);

    if (still) { cleanup.push(() => { delete card.dataset.beamReady; ascii.remove(); beam.remove(); }); return; }

    let raf = null, seed = null, p = 0, dir = 1, last = 0;
    const DUR = 900;

    const fill = () => {
      const r = card.getBoundingClientRect();
      ascii.textContent = flow(Math.ceil(r.width / 6.62), Math.ceil(r.height / 13));
    };

    const frame = now => {
      const dt = last ? (now - last) : 16;
      last = now;
      p += (dt / DUR) * dir;
      if (p > 1) p = 1;
      if (p < 0) p = 0;
      const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      beam.style.left = (e * 100).toFixed(2) + '%';
      beam.style.opacity = String(Math.min(1, Math.sin(Math.PI * Math.min(p, .999)) * 2.2));
      ascii.style.opacity = String(e);
      ascii.style.clipPath = 'inset(0 ' + (100 - e * 100).toFixed(2) + '% 0 0)';
      if (dir > 0 && p < 1) { raf = requestAnimationFrame(frame); return; }
      raf = null; last = 0;
      if (dir > 0) {
        // barrido completo: el codigo se queda mientras el cursor siga encima
        ascii.style.clipPath = 'inset(0 0 0 0)';
        ascii.style.opacity = '1';
        beam.style.transition = 'opacity .45s ease';
        beam.style.opacity = '0';
      }
    };

    const start = () => {
      fill();
      if (seed) clearInterval(seed);
      seed = setInterval(fill, 130);
      ascii.style.transition = '';
      beam.style.transition = '';
      dir = 1; p = 0; last = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (seed) { clearInterval(seed); seed = null; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      dir = -1; last = 0;
      ascii.style.transition = 'opacity .5s ease';
      ascii.style.opacity = '0';
      beam.style.transition = 'opacity .3s ease';
      beam.style.opacity = '0';
    };

    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
    cleanup.push(() => {
      card.removeEventListener('mouseenter', start);
      card.removeEventListener('mouseleave', stop);
      if (raf) cancelAnimationFrame(raf);
      if (seed) clearInterval(seed);
      ascii.remove(); beam.remove();
      delete card.dataset.beamReady;
    });
  });

  return () => cleanup.forEach(f => f());
}
