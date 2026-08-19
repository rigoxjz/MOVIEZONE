// public/js/ui/wakeup.js
import { el, html } from '../core/dom.js';

let banner = null;
let shownAt = 0;

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
}

function hide() {
  if (!banner) return;

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

// Función principal que envuelve tus fetch
export function withWakeupNotice(fetchFunction) {
  return async function(...args) {
    show();
    try {
      const result = await fetchFunction(...args);
      hide();
      return result;
    } catch (error) {
      hide();
      throw error;
    }
  };
}

export { show, hide };
