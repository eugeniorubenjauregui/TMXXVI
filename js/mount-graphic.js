/* mount-graphic.js — monta un gráfico sobre un nodo del template y sobrevive a que
   el template se vuelva a renderizar.

   Dos carreras que hay que ganar:
   1. el nodo que devuelve querySelector puede ser reemplazado después del montaje;
   2. dos llamadas solapadas (mount + update) pueden dejar dos vigilantes, y el
      teardown de uno vacía el host mientras el otro cree que sigue montado.
   Por eso el vigilante no comprueba el nodo, comprueba SU propio montaje: marca el
   host con su id y exige que el host siga teniendo contenido. */

let seq = 0;

export function mountGraphic(selector, importer, initName, opts, prepare) {
  const id = 'm' + (++seq);
  let stop = null, node = null, killed = false, pending = false;

  const unmark = () => {
    if (node && node.dataset && node.dataset.tmMount === id) delete node.dataset.tmMount;
  };
  const teardown = () => {
    if (stop) { try { stop(); } catch (e) {} stop = null; }
    unmark();
    node = null;
  };

  const tryMount = () => {
    if (killed || pending) return;
    const host = document.querySelector(selector);
    if (!host) return;
    const mark = host.dataset ? host.dataset.tmMount : null;
    const alive = host.childElementCount > 0;
    if (node === host && host.isConnected && mark === id && alive) return;   // mi montaje sigue vivo
    if (mark && mark !== id && alive) return;                                // hay otro montaje vivo acá
    teardown();
    node = host;
    if (host.dataset) host.dataset.tmMount = id;
    pending = true;
    if (prepare) { try { prepare(); } catch (e) {} }
    importer().then(m => {
      pending = false;
      if (killed || node !== host || !host.isConnected) return;
      const init = m[initName];
      if (typeof init === 'function') stop = init(host, opts);
    }).catch(() => { pending = false; });
  };

  tryMount();
  const timer = setInterval(tryMount, 500);

  return () => {
    killed = true;
    clearInterval(timer);
    teardown();
  };
}
