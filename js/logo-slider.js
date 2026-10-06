// Arrastre con el dedo de los sliders de logos (.tm-marq).
// La franja avanza sola con una animación CSS (@keyframes tmmarq: translateX(0 → -50%) sobre un
// track con los logos duplicados). Aquí, al tocar y arrastrar en horizontal, se toma el control:
// se pausa la animación, el track sigue al dedo (con vuelta infinita) y, al soltar, la animación
// retoma desde la posición actual. El scroll vertical de la página no se bloquea (touch-action: pan-y).
// Solo actúa con touch/lápiz y mientras el track esté animado (si no hay animación —escritorio en
// cuadrícula o prefers-reduced-motion, que ya usa scroll nativo— no hace nada).
const THRESHOLD = 6;   // px de movimiento horizontal antes de considerarlo un arrastre

export function initLogoSliders(root) {
  root = root || document;
  const offs = [];

  root.querySelectorAll('.tm-marq').forEach((box) => {
    const track = box.querySelector('.tm-logos, .tm-logos-row');
    if (!track) return;

    let id = null, startX = 0, startY = 0, startTx = 0, dragging = false, half = 0;

    const animated = () => getComputedStyle(track).animationName !== 'none';
    const tx = () => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
    const wrap = (x) => { while (x > 0) x -= half; while (x <= -half) x += half; return x; };

    function down(e) {
      if (e.pointerType === 'mouse' || id !== null || !animated()) return;
      id = e.pointerId; startX = e.clientX; startY = e.clientY; dragging = false;
      startTx = tx(); half = track.offsetWidth / 2;
    }

    function move(e) {
      if (e.pointerId !== id) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
        dragging = true;
        track.style.animation = 'none';
        track.style.transition = 'none';   // [data-rv] anima transform: sin esto el track iría rezagado respecto al dedo
        track.style.transform = 'translateX(' + startTx + 'px)';
        try { box.setPointerCapture(id); } catch (err) {}
      }
      track.style.transform = 'translateX(' + wrap(startTx + dx) + 'px)';
    }

    function up(e) {
      if (e.pointerId !== id) return;
      const was = dragging;
      id = null; dragging = false;
      if (!was) return;
      const x = wrap(tx());
      track.style.transform = '';
      track.style.animation = '';
      track.style.transition = '';
      const dur = parseFloat(getComputedStyle(track).animationDuration) || 32;
      track.style.animationDelay = (-(-x / half) * dur) + 's';   // retoma desde la posición actual
      void track.offsetWidth;                                     // reinicia la animación con el nuevo delay
      try { box.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    box.style.touchAction = 'pan-y';
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    offs.push(() => {
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      box.style.touchAction = '';
      track.style.animation = ''; track.style.transform = ''; track.style.transition = ''; track.style.animationDelay = '';
    });
  });

  return () => offs.forEach((f) => f());
}
