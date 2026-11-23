import { segments } from './reader.mjs';

const popup = document.querySelector('#popup');
const popupTitle = document.querySelector('#popup-title');
const popupBody = document.querySelector('#popup-body');
const closeButton = document.querySelector('#close');
let trigger, fragment, leaveTimer;

function closePopup(restoreFocus = false) {
  clearTimeout(leaveTimer);
  trigger?.setAttribute('aria-expanded', 'false');
  popup.close();
  if (restoreFocus) trigger?.focus({ preventScroll: true });
  trigger = fragment = undefined;
}

function positionPopup() {
  if (!popup.open || !trigger) return;
  const box = (fragment?.isConnected ? fragment : trigger).getBoundingClientRect();
  const gap = 6, margin = 8;
  const width = popup.offsetWidth, height = popup.offsetHeight;
  let left = box.right + gap, top = box.top;
  if (left + width > innerWidth - margin) {
    if (box.left - width - gap >= margin) left = box.left - width - gap;
    else {
      left = box.left;
      top = box.bottom + gap;
      if (top + height > innerHeight - margin && box.top > height + gap) top = box.top - height - gap;
    }
  }
  popup.style.left = Math.max(margin, Math.min(left, innerWidth - width - margin)) + 'px';
  popup.style.top = Math.max(margin, Math.min(top, innerHeight - height - margin)) + 'px';
}

function showPopup(button, target, piece, label, keyboard) {
  clearTimeout(leaveTimer);
  trigger?.setAttribute('aria-expanded', 'false');
  trigger = button;
  fragment = target;
  popupTitle.textContent = label;
  const quote = document.createElement('blockquote');
  quote.textContent = piece.text;
  popupBody.replaceChildren(quote);
  for (const { entries, pkg } of piece.hits) {
    for (const { note } of entries) {
      const heading = document.createElement('h4');
      heading.textContent = pkg.layers.find(l => l.layer_id === note.layer_id).display_name;
      const body = document.createElement('p');
      body.textContent = note.text;
      popupBody.append(heading, body);
    }
  }
  popup.style.setProperty('--lane-color', button.style.getPropertyValue('--lane-color'));
  trigger.setAttribute('aria-expanded', 'true');
  popup.hidden = false;
  // A nonmodal panel keeps both the passage and its other edition lines interactive.
  popup.setAttribute('open', '');
  popup.scrollTop = 0;
  positionPopup();
  if (keyboard) closeButton.focus({ preventScroll: true });
}

function scheduleClose(event) {
  if (event.pointerType === 'mouse' && !popup.contains(document.activeElement)) {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => closePopup(), 300);
  }
}
closeButton.onclick = () => closePopup(true);
popup.onpointerenter = () => clearTimeout(leaveTimer);
popup.onpointerleave = scheduleClose;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && popup.open) {
    event.preventDefault();
    closePopup(true);
  }
});
function dismissOutside(event) {
  if (popup.open && !popup.contains(event.target) && !trigger?.contains(event.target)) closePopup();
}
document.addEventListener('pointerdown', dismissOutside);
document.addEventListener('focusin', dismissOutside);
window.addEventListener('scroll', positionPopup, { capture: true, passive: true });
window.addEventListener('resize', positionPopup);

const palette = ['#26745d', '#a74e37', '#596fac', '#926822', '#815081'];
export const laneColor = i => palette[i] ?? `hsl(${(i * 137.5) % 360} 48% 36%)`;

// Measure the original text node directly so punctuation, line wraps and offsets
// remain those of the source even when several editions annotate the same words.
export function annotatedParagraph(unit, lanes) {
  const para = document.createElement('p');
  para.className = 'original';
  const text = document.createTextNode(unit.text);
  para.append(text);
  para.style.setProperty('--lane-count', lanes.length);
  const marks = [];
  lanes.forEach(({ chapter, label }, lane) => {
    let offset = 0;
    for (const piece of segments(unit, [chapter])) {
      const start = offset;
      offset += piece.text.length;
      if (!piece.hits.length) continue;
      const runs = [...piece.text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)];
      if (!runs.length) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'annotation-line';
      button.style.setProperty('--lane-color', laneColor(lane));
      button.setAttribute('aria-label', label + ' · ' + piece.text);
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'popup');
      button.setAttribute('aria-expanded', 'false');
      button.onpointerover = e => {
        if (e.pointerType === 'mouse' && !e.buttons) showPopup(button, e.target, piece, label, false);
      };
      button.onpointerleave = scheduleClose;
      button.onclick = e => showPopup(button, e.target, piece, label, e.detail === 0);
      const ranges = runs.map(run => {
        const range = document.createRange();
        range.setStart(text, start + run.index);
        range.setEnd(text, start + run.index + run[0].length);
        return range;
      });
      marks.push({ ranges, button, lane });
      para.append(button);
    }
  });

  function layout() {
    const origin = para.getBoundingClientRect();
    const step = parseFloat(getComputedStyle(para).getPropertyValue('--lane-step'));
    const measured = marks.map(m => m.ranges.flatMap(r => [...r.getClientRects()]).filter(r => r.width > 0));
    marks.forEach(({ button, lane }, i) => {
      const rects = measured[i];
      if (!rects.length) return;
      const first = rects[0];
      Object.assign(button.style, { left: (first.left - origin.left) + 'px',
        top: (first.bottom - origin.top + lane * step) + 'px', width: first.width + 'px' });
      button.replaceChildren(...rects.map(rect => {
        const part = document.createElement('span');
        Object.assign(part.style, { left: (rect.left - first.left) + 'px',
          top: (rect.bottom - first.bottom) + 'px', width: rect.width + 'px' });
        return part;
      }));
    });
  }
  return { para, layout };
}

export function observeLines(paragraphs) {
  const redraw = new Map(paragraphs.map(p => [p.para, p.layout]));
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) redraw.get(entry.target)?.();
    positionPopup();
  });
  for (const p of paragraphs) observer.observe(p.para);
  const refresh = () => { for (const p of paragraphs) p.layout(); positionPopup(); };
  document.fonts.addEventListener('loadingdone', refresh);
  return () => {
    observer.disconnect();
    document.fonts.removeEventListener('loadingdone', refresh);
    closePopup();
  };
}
