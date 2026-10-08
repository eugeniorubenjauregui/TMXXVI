// Envío del formulario de contacto → WordPress (MySQL + HubSpot).
// Compartido por index.html y ContactForm.dc.html; se carga con import('./js/contact-form.js').
// Sobre-escribible en staging con window.TM_LEADS_ENDPOINT antes de que monte el formulario.
const LEADS_ENDPOINT = 'https://titamedia.com/wp-json/tita/v1/leads';
// reCAPTCHA v3 (invisible). La site key es pública; vacía = desactivado. Sobre-escribible con window.TM_RECAPTCHA_SITE_KEY.
// La secret key vive SOLO en WordPress (TITA_RECAPTCHA_SECRET), nunca aquí.
const RECAPTCHA_SITE_KEY = '6LfFA-EtAAAAAMn29NCOP65lczurUCWGGX1pIIlN';
const RECAPTCHA_ACTION = 'lead';
const TIMEOUT_MS = 15000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Teléfono opcional: dígitos, espacios, +, paréntesis, puntos y guiones; entre 7 y 15 dígitos.
const phoneOk = (v)=> !v || (/^[+\d][\d\s().-]{5,28}$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15);

const MSG = {
  required: 'Completa nombre, correo, cuéntanos qué necesitas y acepta el tratamiento de datos.',
  email: 'Revisa el correo: no parece válido.',
  phone: 'Revisa el teléfono: usa solo números, espacios, + o guiones (mínimo 7 dígitos).',
  sending: 'Enviando…',
  ok: 'Gracias. Recibimos tu solicitud y nuestro equipo te contactará pronto.',
  rate: 'Enviaste varias solicitudes seguidas. Intenta de nuevo en un rato o escríbenos a cuentanos@titamedia.com.',
  captcha: 'No pudimos verificar que eres una persona. Recarga la página e intenta de nuevo o escríbenos a cuentanos@titamedia.com.',
  error: 'No pudimos enviar tu solicitud. Intenta de nuevo o escríbenos a cuentanos@titamedia.com.',
};

function cookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

let recaptchaLoading = null;
function loadRecaptcha(key){
  if(window.grecaptcha && window.grecaptcha.execute) return Promise.resolve();
  if(!recaptchaLoading){
    recaptchaLoading = new Promise((resolve, reject)=>{
      // El badge flotante choca con el botón de WhatsApp; el aviso legal va en el formulario.
      const st = document.createElement('style'); st.textContent = '.grecaptcha-badge{visibility:hidden}'; document.head.appendChild(st);
      const el = document.createElement('script');
      el.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(key);
      el.async = true; el.onload = resolve; el.onerror = ()=>{ recaptchaLoading = null; reject(new Error('recaptcha')); };
      document.head.appendChild(el);
    });
  }
  return recaptchaLoading;
}

// Devuelve el token o '' si no hay key / falla la carga (el servidor decide qué hacer sin token).
async function recaptchaToken(){
  const key = window.TM_RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY;
  if(!key) return '';
  try{
    await loadRecaptcha(key);
    await new Promise((r)=> window.grecaptcha.ready(r));
    return await window.grecaptcha.execute(key, { action: RECAPTCHA_ACTION });
  }catch(e){ return ''; }
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
      name: val('q1'), company: val('q2'), role: val('q3'), email: val('q4'), phone: val('q8'),
      country: val('q5'), city: val('q9'), source: val('q6'), message: val('q7'),
      needs: needs,
      consent: !!(root.querySelector('#tm-cf-consent') || {}).checked,
      website: val('tm-cf-website'), // honeypot: debe ir vacío
      page_url: location.href.split('#')[0].slice(0, 500),
      hutk: cookie('hubspotutk'),
      utm: utm,
    };
  }

  function reset(){
    Array.prototype.forEach.call(root.querySelectorAll('#tm-contacto input[type="text"], #tm-contacto input[type="email"], #tm-contacto input[type="tel"], #tm-contacto textarea, #tm-contacto select'), (el)=>{ el.value = ''; });
    Array.prototype.forEach.call(root.querySelectorAll('input[name="need"], #tm-cf-consent'), (el)=>{ el.checked = false; });
  }

  async function onClick(){
    if(btn.disabled) return;
    const data = collect();
    if(!data.name || !data.email || !data.message || !data.consent) return say(MSG.required, 'error');
    if(!EMAIL_RE.test(data.email)) return say(MSG.email, 'error');
    if(!phoneOk(data.phone)) return say(MSG.phone, 'error');

    btn.disabled = true; btn.style.opacity = '.6';
    say(MSG.sending, 'ok');
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), TIMEOUT_MS);
    try{
      data.recaptcha_token = await recaptchaToken();
      const res = await fetch(window.TM_LEADS_ENDPOINT || LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      if(res.status === 429) return say(MSG.rate, 'error');
      if(res.status === 403) return say(MSG.captcha, 'error');
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

  // Precarga el script al interactuar con el formulario (no al cargar la página).
  const warm = ()=>{ const k = window.TM_RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY; if(k) loadRecaptcha(k).catch(()=>{}); };
  const form = root.querySelector('#tm-contacto');
  if(form) form.addEventListener('focusin', warm, { once: true });

  btn.addEventListener('click', onClick);
  return function(){ btn.removeEventListener('click', onClick); };
}
