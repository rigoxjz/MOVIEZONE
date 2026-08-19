// public/js/ui/wakeup.js - CON TIMEOUT Y MANEJO DE ERRORES
import { el, html } from '../core/dom.js';

let banner = null;
let shownAt = 0;
let timeoutId = null;

function create() {
  const node = el('div', {
    class: 'wakeup',
    role: 'status',
    'aria-live': 'polite',
    html: html`
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <span class="wakeup__text">
        <span class="wakeup__title">Cargando servidor…</span>
        <span class="wakeup__note">La primera carga del día puede tardar hasta 1 minuto</span>
      </span>`
  });

  document.body.append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  return node;
}

function show() {
  if (banner) return;
  banner = create();
  shownAt = Date.now();
  
  // ⭐ NUEVO: Timeout de seguridad (60 segundos)
  timeoutId = setTimeout(() => {
    console.warn('⏰ Timeout: El servidor no respondió en 60 segundos');
    // Cambiar el mensaje a "error"
    if (banner) {
      const title = banner.querySelector('.wakeup__title');
      const note = banner.querySelector('.wakeup__note');
      if (title) title.textContent = '⚠️ El servidor está tardando más de lo esperado';
      if (note) note.textContent = 'Reintentando automáticamente...';
    }
  }, 60000);
}

function hide() {
  if (!banner) return;

  // Limpiar el timeout si existe
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  const visible = Date.now() - shownAt;
  const delay = Math.max(0, 900 - visible);

  const node = banner;
  banner = null;

  setTimeout(() => {
    node.classList.remove('is-visible');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 600);
  }, delay);
}

export function withWakeupNotice(fetchFunction) {
  return async function(...args) {
    show();
    try {
      // ⭐ NUEVO: Timeout para cada fetch (30 segundos)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const result = await fetchFunction(...args, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      hide();
      return result;
    } catch (error) {
      console.error('❌ Error en fetch con wakeup:', error);
      // Si el error es por timeout, mostrar mensaje específico
      if (error.name === 'AbortError') {
        console.warn('⏰ La petición tardó más de 30 segundos');
      }
      hide();
      throw error;
    }
  };
}

export { show, hide };
