/* =====================================================================
 * Icons — one consistent set: 24 × 24 grid, 1.7 px strokes, round caps.
 * icon(name) returns an <svg> element (aria-hidden; the button carries the label).
 * Body-part icons draw a small front view of the character with the
 * part filled (the character's left side is on the viewer's right).
 * ===================================================================== */
const P = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  loop: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V10a4 4 0 0 1 4-4h13"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1a4 4 0 0 1-4 4h-13"/>',
  save: '<path d="M5 3.5h11l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M8 3.5v5h7v-5M7.5 20.5v-6h9v6"/>',
  download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 15.5v-12M7 8.5l5-5 5 5M4.5 20h15"/>',
  test: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="17.8" cy="13.8" r=".9" fill="currentColor"/>',
  select: '<path d="M5 3.5 18.5 10l-6 1.8-2.4 6.2z" stroke-linejoin="round"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.5 3.5v5h-5"/>',
  scale: '<rect x="3.5" y="10.5" width="10" height="10" rx="1.2"/><path d="M13 3.5h7.5V11M20.5 3.5l-8 8"/>',
  focus: '<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
  grid: '<path d="M3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17"/><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/>',
  joints: '<circle cx="12" cy="5.5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="12" cy="18.5" r="2"/><path d="M12 7.5v9M8 12h8"/>',
  ghost: '<path d="M12 3.5a6.5 6.5 0 0 0-6.5 6.5v10.5l2.2-1.6 2.1 1.6 2.2-1.6 2.2 1.6 2.1-1.6 2.2 1.6V10A6.5 6.5 0 0 0 12 3.5z" stroke-dasharray="2.2 2"/><circle cx="9.5" cy="10.5" r=".9" fill="currentColor"/><circle cx="14.5" cy="10.5" r=".9" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 2.2"/><path d="M8.5 7 3.5 12l5 5z"/><path d="M15.5 7l5 5-5 5z"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.5v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16" rx="1.5"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h4"/>',
  key: '<path d="M12 4.5 19.5 12 12 19.5 4.5 12z"/>',
  keyAdd: '<path d="M10.5 5 17 11.5 10.5 18 4 11.5z"/><path d="M18.5 3v5M16 5.5h5"/>',
  keyDel: '<path d="M10.5 5 17 11.5 10.5 18 4 11.5z"/><path d="M16 5.5h5"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronUp: '<path d="m6 14.5 6-6 6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z" stroke-linejoin="round"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18 9.5h.01M7.5 14.5h9"/>',
  folder: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.2h8A1.5 1.5 0 0 1 20.5 8.7V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  filePlus: '<path d="M13.5 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9z"/><path d="M13.5 3.5V9H19M12 12v6M9 15h6"/>',
  file: '<path d="M13.5 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9z"/><path d="M13.5 3.5V9H19"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  duplicate: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5M14 11.5v5M11.5 14h5"/>',
  record: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.5"/>',
  stepBack: '<path d="M6 5v14"/><path d="M18.5 5.5v13L9 12z" fill="currentColor" stroke="none"/>',
  stepFwd: '<path d="M18 5v14"/><path d="M5.5 5.5v13L15 12z" fill="currentColor" stroke="none"/>',
  toStart: '<path d="M5.5 5v14"/><path d="M19 5.5v13l-6.5-6.5z M12.5 5.5v13L6 12z" fill="currentColor" stroke="none"/>',
  body: '<rect x="9" y="2.5" width="6" height="5" rx="1.6"/><rect x="7.5" y="8.5" width="9" height="7" rx="1.2"/><rect x="4.2" y="8.5" width="2.6" height="7" rx="1.2"/><rect x="17.2" y="8.5" width="2.6" height="7" rx="1.2"/><rect x="7.6" y="16.3" width="4" height="5.2" rx="1.2"/><rect x="12.4" y="16.3" width="4" height="5.2" rx="1.2"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-1-1.4-1-2.5 0-1 .8-1.8 1.8-1.8h2.1a3.8 3.8 0 0 0 3.8-3.8c0-4-3.8-7.2-8.5-7.2z"/><circle cx="7.6" cy="11.5" r="1.1" fill="currentColor"/><circle cx="10.2" cy="7.6" r="1.1" fill="currentColor"/><circle cx="14.7" cy="7.8" r="1.1" fill="currentColor"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="1.8"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  shape: '<rect x="6.5" y="3.5" width="11" height="17" rx="3.5"/><path d="M3 8v8M21 8v8M3 12h3M18 12h3"/>',
  pose: '<circle cx="12" cy="4.8" r="2"/><path d="M12 7v7M12 9.5l-5-3M12 9.5l5 2.5M12 14l-3.5 6.5M12 14l3.5 6.5"/>',
  face: '<rect x="4.5" y="4.5" width="15" height="15" rx="4"/><circle cx="9.3" cy="10.3" r="1.1" fill="currentColor"/><circle cx="14.7" cy="10.3" r="1.1" fill="currentColor"/><path d="M9 14.5q3 2.3 6 0"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  exit: '<path d="M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5"/><path d="M15 8l4.5 4-4.5 4M9.5 12h10"/>',
  jump: '<path d="M12 19.5V6M7 10.5l5-5 5 5"/><path d="M5 20h14"/>',
  run: '<circle cx="14" cy="4.5" r="1.8"/><path d="m6 12 3.5-4.5h4l2.5 3.5 3 1M12 8l-1.5 5.5 3.5 2-1 5M10.5 13.5 7.5 20"/>',
  speed: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="m12 16 4-5"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  spinner: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>',
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 4l16 16"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.3-5.4-3.4L3.8 13.6a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
};

/* body-part mini figure: [x, y, w, h] per part as seen from the front */
const FIG = {
  head: [9, 2, 6, 5], torso: [7.6, 8, 8.8, 7.6], rightArm: [4.2, 8, 2.8, 7.4], leftArm: [17, 8, 2.8, 7.4], rightLeg: [7.6, 16.2, 4.1, 5.8], leftLeg: [12.3, 16.2, 4.1, 5.8],
};
function figure(part) {
  return Object.entries(FIG).map(([id, [x, y, w, h]]) => {
    const on = id === part || part === 'root';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.3" ${on ? 'fill="currentColor" stroke="currentColor"' : 'fill="none" stroke="currentColor" opacity=".38"'}/>`;
  }).join('');
}

const NS = 'http://www.w3.org/2000/svg';
export function icon(name, size = 20) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', name.startsWith('part:') ? '1.2' : '1.7');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.classList.add('ic');
  s.innerHTML = name.startsWith('part:') ? figure(name.slice(5)) : (P[name] || P.dot);
  return s;
}
export const hasIcon = n => !!P[n];
