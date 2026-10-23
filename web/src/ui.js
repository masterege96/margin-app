import { esc } from './format.js';
import { hydrateIcons, icon } from './icons.js';

export const byId = (id) => document.getElementById(id);

/** A problem with what the user typed: shown as a toast, not logged as an error. */
export class InputError extends Error {}

export function openModal(content, drawer = false) {
  byId('modalRoot').innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal ${drawer ? 'drawer' : ''}" role="dialog" aria-modal="true">${content}</div></div>`;
  hydrateIcons(byId('modalRoot'));
  document.body.style.overflow = 'hidden';
  const first = byId('modalRoot').querySelector('input:not([type=hidden]), select, button');
  if (first) first.focus();
}

export function closeModal() {
  byId('modalRoot').innerHTML = '';
  document.body.style.overflow = '';
}

let toastTimer;
export function toast(message, error = false) {
  byId('toastRoot').innerHTML = `<div class="toast ${error ? 'error' : ''}">${esc(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    byId('toastRoot').innerHTML = '';
  }, 3600);
}

export function formInput(name, label, value = '', type = 'text', placeholder = '', extra = '') {
  return `<div class="form-field ${extra}"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${esc(name)}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${extra.includes('required') ? 'required' : ''} ${type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''}></div>`;
}

export function modalHead(title, desc) {
  return `<div class="modal-head"><div><h2 class="modal-title">${esc(title)}</h2><p class="modal-subtitle">${esc(desc)}</p></div><button class="close-btn" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>`;
}

export function modalFooter(label) {
  return `<div class="modal-actions"><button type="button" class="button button-ghost" data-action="close-modal">Cancel</button><button type="submit" class="button button-accent">${icon('check-circle', 15)} ${esc(label)}</button></div>`;
}
