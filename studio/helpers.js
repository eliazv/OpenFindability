export const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const rich = (v) => esc(v).replace(/\*([^*]+)\*/g, '<em>$1</em>').replaceAll('\n', '<br>');
export const icon = (name) => {
  const paths = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-3v2a3 3 0 0 1-3 3H3"/>',
    tag: '<path d="M3 3h10l8 8-10 10-8-8Z"/><circle cx="8" cy="8" r="1"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="17" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h2m3 0h2m3 0h2"/>',
    list: '<rect x="5" y="3" width="14" height="19" rx="3"/><path d="M9 2h6M9 9h6m-6 4h6m-6 4h4"/>',
    money: '<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3"/>',
    team: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 6"/>',
    filter: '<path d="M3 7h4m4 0h10M3 17h10m4 0h4"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>',
    up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    spark: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    signal: '<path d="M4 20v-3m5 3v-6m5 6V10m5 10V6"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M6 12.5a9 9 0 0 1 12 0M9.5 16a4 4 0 0 1 5 0"/><circle cx="12" cy="19" r=".8"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
    flow: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6 8.3l4.8 7.5M18 8.3l-4.8 7.5"/>',
    lock: '<rect x="5" y="10" width="14" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.list}</svg>`;
};
