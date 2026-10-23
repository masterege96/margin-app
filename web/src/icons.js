const iconPath = {
  'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  layers: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M7 2h10M7 23h10M3 10h18"/>',
  receipt: '<path d="M4 3h16v18l-4-2-4 2-4-2-4 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l-1.8 1.8a1.6 1.6 0 0 0-1.7-.3l-1.1.5-1 2.3H10l-1-2.3-1.1-.5a1.6 1.6 0 0 0-1.7.3l-1.8-1.8A1.6 1.6 0 0 0 4.7 15l-.5-1.1L2 13v-2l2.2-.9.5-1.1a1.6 1.6 0 0 0-.3-1.7l1.8-1.8a1.6 1.6 0 0 0 1.7.3L9 5.3 10 3h4l1 2.3 1.1.5a1.6 1.6 0 0 0 1.7-.3l1.8 1.8a1.6 1.6 0 0 0-.3 1.7l.5 1.1L22 11v2l-2.2.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v13m0 0 5-5m-5 5-5-5M5 20h14"/>',
  'trending-up': '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  activity: '<path d="M3 12h5l3-7 3 14 3-7h4"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v11c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  'alert-triangle': '<path d="M10.3 3.9 1.9 18.2A2 2 0 0 0 3.6 21h16.8a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  x: '<path d="M5 5l14 14M19 5 5 19"/>',
  edit: '<path d="M12 20h9M4 16v4h4L20 8l-4-4z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  shield: '<path d="m12 2 8 4v6c0 5-3.6 8-8 10-4.4-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-6"/>',
  server: '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
  sparkles: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  'circle-help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2 1-2 1.4-2 3M12 17h.01"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};

export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath[name] || iconPath.layers}</svg>`;
}

export function hydrateIcons(scope = document) {
  scope.querySelectorAll('[data-i]').forEach((el) => {
    el.innerHTML = icon(el.dataset.i);
  });
}
