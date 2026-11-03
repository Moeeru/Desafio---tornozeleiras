/** Acesso ao DOM, tooltip e preferências do navegador. */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado no index.html`);
  return el as T;
}

export const reduceMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let tip: HTMLElement | null = null;
const tipEl = (): HTMLElement => (tip ??= $('tip'));

export function showTip(ev: PointerEvent, html: string): void {
  const t = tipEl();
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}

export function hideTip(): void {
  tipEl().hidden = true;
}

/** Liga o tooltip a todo elemento com data-tip dentro de root. */
export function bindTips(root: ParentNode, lookup: (key: string) => string): void {
  root.querySelectorAll<HTMLElement | SVGElement>('[data-tip]').forEach(el => {
    el.addEventListener('pointermove', ev => showTip(ev as PointerEvent, lookup(el.dataset.tip ?? '')));
    el.addEventListener('pointerleave', hideTip);
  });
}

/** Liga um clique a cada elemento que casa com o seletor. */
export function onEach<T extends Element>(root: ParentNode, selector: string, fn: (el: T, ev: Event) => void): void {
  root.querySelectorAll<T>(selector).forEach(el => el.addEventListener('click', ev => fn(el, ev)));
}
