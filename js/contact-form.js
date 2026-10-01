// Envío del formulario de contacto → WordPress (MySQL + HubSpot).
// Compartido por index.html y ContactForm.dc.html; se carga con import('./js/contact-form.js').
// Sobre-escribible en staging con window.TM_LEADS_ENDPOINT antes de que monte el formulario.
const LEADS_ENDPOINT = 'https://titamedia.com/wp-json/tita/v1/leads';
const TIMEOUT_MS = 15000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MSG = {
  required: 'Completa nombre, correo, cuéntanos qué necesitas y acepta el tratamiento de datos.',
  email: 'Revisa el correo: no parece válido.',
  sending: 'Enviando…',
  ok: 'Gracias. Recibimos tu solicitud y nuestro equipo te contactará pronto.',
  rate: 'Enviaste varias solicitudes seguidas. Intenta de nuevo en un rato o escríbenos a cuentanos@titamedia.com.',
  error: 'No pudimos enviar tu solicitud. Intenta de nuevo o escríbenos a cuentanos@titamedia.com.',
};

function cookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export function initContactForm(root){
  root = root || document;
  const btn = root.querySelector('#tm-cf-submit');
  const status = root.querySelector('#tm-cf-status');
  if(!btn || !status) return function(){};

  const val = (id)=> ((root.querySelector('#' + id) || {}).value || '').trim();
  const say = (text, tone)=>{
    status.textContent = text;
    status.style.color = tone === 'error' ? '#B3261E' : '#2E8C52';
  };

  function collect(){
    const params = new URLSearchParams(location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k)=>{
      const v = params.get(k); if(v) utm[k] = v.slice(0, 150);
    });
    const needs = Array.prototype.slice.call(root.querySelectorAll('input[name="need"]:checked'))
      .map((el)=>{ const s = el.parentElement && el.parentElement.querySelector('span'); return s ? s.textContent.trim() : ''; })
      .filter(Boolean);
    return {
      name: val('q1'), company: val('q2'), role: val('q3'), email: val('q4'),
      country: val('q5'), source: val('q6'), message: val('q7'),
      needs: needs,
      consent: !!(root.querySelector('#tm-cf-consent') || {}).checked,
      website: val('tm-cf-website'), // honeypot: debe ir vacío
      page_url: location.href.split('#')[0].slice(0, 500),
      hutk: cookie('hubspotutk'),
      utm: utm,
    };
  }

  function reset(){
    Array.prototype.forEach.call(root.querySelectorAll('#tm-contacto input[type="text"], #tm-contacto input[type="email"], #tm-contacto textarea, #tm-contacto select'), (el)=>{ el.value = ''; });
    Array.prototype.forEach.call(root.querySelectorAll('input[name="need"], #tm-cf-consent'), (el)=>{ el.checked = false; });
  }

  async function onClick(){
    if(btn.disabled) return;
    const data = collect();
    if(!data.name || !data.email || !data.message || !data.consent) return say(MSG.required, 'error');
    if(!EMAIL_RE.test(data.email)) return say(MSG.email, 'error');

    btn.disabled = true; btn.style.opacity = '.6';
    say(MSG.sending, 'ok');
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), TIMEOUT_MS);
    try{
      const res = await fetch(window.TM_LEADS_ENDPOINT || LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      if(res.status === 429) return say(MSG.rate, 'error');
      if(!res.ok) return say(MSG.error, 'error');
      say(MSG.ok, 'ok');
      reset();
      // Sin PII en el dataLayer.
      (window.dataLayer = window.dataLayer || []).push({ event: 'generate_lead', form_id: 'contacto', needs_count: data.needs.length });
    }catch(e){
      say(MSG.error, 'error');
    }finally{
      clearTimeout(timer);
      btn.disabled = false; btn.style.opacity = '';
    }
  }

  btn.addEventListener('click', onClick);
  return function(){ btn.removeEventListener('click', onClick); };
}
