/** Gráficos em SVG/HTML feitos à mão (sem bibliotecas) e pequenos componentes visuais. */
import type { TipoEncontro } from '../../../../shared/contrato.js';
import { STACK, TIPO, TIPOS, sw } from '../nucleo/constantes.js';
import { bindTips } from '../nucleo/dom.js';
import { esc, nf, nf1, pct, quantile } from '../nucleo/formato.js';
import type { Enc } from '../nucleo/modelo.js';

export function svgOpen(w: number, h: number, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">`;
}

/** Retângulo com só os cantos de cima arredondados (ponta de barra). */
export function roundTop(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export const niceStep = (max: number): number => (max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : max <= 60 ? 10 : 20);

export const legendaHtml = (keys: TipoEncontro[]): string =>
  `<div class="legenda">${keys.map(k => `<span><i style="background:${sw(k)}"></i>${TIPO[k].nome}</span>`).join('')}</div>`;

/** Contagem por tipo em formato compacto (quadradinho colorido + número). */
export const miniTipos = (c: Record<TipoEncontro, number>): string =>
  `<span class="mini">${TIPOS.filter(t => c[t.k]).map(t =>
    `<span title="${t.nome}"><i style="background:${sw(t.k)}"></i>${c[t.k]}</span>`).join('') || '<span class="role">–</span>'}</span>`;

/** Largura útil de um contêiner de gráfico (0 quando está oculto). */
export const larguraDe = (el: HTMLElement, minimo = 280): number => (el.clientWidth ? Math.max(minimo, el.clientWidth) : 0);

/** Barra de composição por tipo (100%), com rótulos abaixo. */
export function composicaoHtml(c: Record<TipoEncontro, number>): string {
  const total = TIPOS.reduce((s, t) => s + c[t.k], 0);
  return `<div class="comp">
    <div class="comp-bar">${TIPOS.map(t => (c[t.k] ? `<span style="width:${(c[t.k] / total) * 100}%;background:${sw(t.k)}" title="${t.nome}: ${c[t.k]}"></span>` : '')).join('')}</div>
    <div class="legenda">${TIPOS.map(t => `<span><i style="background:${sw(t.k)}"></i>${t.nome} <b>${nf.format(c[t.k])}</b> · ${pct(c[t.k], total)}%</span>`).join('')}</div>
  </div>`;
}

export interface EtapaFunil { rotulo: string; valor: number; desc: string }

/** Funil horizontal: cada etapa com a barra proporcional à primeira e o % em relação a ela. */
export function funilHtml(etapas: EtapaFunil[], destaque = etapas.length - 1): string {
  const base = Math.max(1, etapas[0]?.valor ?? 1);
  return `<ol class="funil">${etapas.map((e, i) => {
    const p = (e.valor / base) * 100;
    const pctTxt = i === 0 ? '100%' : p >= 1 ? `${nf1.format(p)}%` : p > 0 ? `${p.toFixed(p >= 0.01 ? 2 : 4).replace('.', ',')}%` : '0%';
    return `<li class="${i === destaque ? 'dest' : ''}">
      <div class="funil-t"><span class="funil-r">${e.rotulo}</span><span class="funil-v">${nf.format(e.valor)} <small>${pctTxt}</small></span></div>
      <div class="funil-b"><span style="width:${Math.max(p, e.valor ? 0.6 : 0)}%"></span></div>
      <p class="funil-d">${e.desc}</p>
    </li>`;
  }).join('')}</ol>`;
}

export interface LinhaBarra { n: number; c: Record<TipoEncontro, number>; total: number; extra?: string }

/** Colunas empilhadas por tipo, uma por dataset. */
export function desenharBarras(el: HTMLElement, linhas: LinhaBarra[], destaque: Set<number>, onClick?: (n: number) => void): void {
  const W = larguraDe(el);
  if (!W) return;
  const H = 240, m = { l: 30, r: 4, t: 22, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxT = Math.max(1, ...linhas.map(r => r.total));
  const step = niceStep(maxT), top = Math.ceil(maxT / step) * step;
  const y = (v: number): number => m.t + ih - (v / top) * ih;
  const band = iw / Math.max(1, linhas.length), bw = Math.min(40, band * 0.56);
  let s = svgOpen(W, H, 'Encontros por dataset, empilhados por tipo');
  for (let v = 0; v <= top; v += step) {
    s += `<line class="${v === 0 ? 'base-l' : 'grid-l'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text class="ax" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  linhas.forEach((r, i) => {
    const cx = m.l + band * i + band / 2, x0 = cx - bw / 2;
    const dim = destaque.size && !destaque.has(r.n) ? ' dim' : '';
    const vis = STACK.filter(k => r.c[k] > 0);
    let acc = 0;
    vis.forEach((k, j) => {
      const yTop = y(acc + r.c[k]), h = Math.max(0, y(acc) - yTop - (j > 0 ? 2 : 0));
      s += j === vis.length - 1
        ? `<path class="m-${k}${dim}" d="${roundTop(x0, yTop, bw, h, 4)}"/>`
        : `<rect class="m-${k}${dim}" x="${x0}" y="${yTop}" width="${bw}" height="${h}"/>`;
      acc += r.c[k];
    });
    s += `<text class="val-lab${dim}" x="${cx}" y="${y(r.total) - 7}" text-anchor="middle">${r.total}</text>`;
    s += `<text class="ax-strong${dim}" x="${cx}" y="${H - 8}" text-anchor="middle">D${r.n}</text>`;
    s += `<rect class="hit" data-tip="${r.n}" data-ds="${r.n}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}"/>`;
  });
  el.innerHTML = `${s}</svg>`;
  const R = new Map(linhas.map(r => [r.n, r]));
  bindTips(el, n => {
    const r = R.get(Number(n));
    if (!r) return '';
    return `<div class="tt">Dataset ${n}: ${r.total} encontros</div>${TIPOS.map(t => `${t.nome}: <b>${r.c[t.k]}</b>`).join('<br>')}${r.extra ?? ''}${onClick ? '<br>Clique para filtrar por este dataset' : ''}`;
  });
  if (onClick) el.querySelectorAll<SVGElement>('[data-ds]').forEach(h => h.addEventListener('click', () => onClick(Number(h.dataset.ds))));
}

/** Faixa de distância por tipo: do menor ao maior valor, metade central destacada, mediana marcada. */
export function desenharFaixas(el: HTMLElement, E: Enc[], limite: number): void {
  const W = larguraDe(el);
  if (!W) return;
  const lw = 78, rowH = 52, m = { r: 12, t: 26, b: 26 };
  const iw = W - lw - m.r, H = m.t + TIPOS.length * rowH + m.b;
  // Escala de 0 até a distância limite da configuração, com 4 divisões
  const lim = limite, passo = lim / 4;
  const x = (v: number): number => lw + (v / lim) * iw;
  let s = svgOpen(W, H, `Faixa de distância dos encontros por tipo, de 0 a ${nf1.format(lim)} metros`);
  for (let i = 0; i <= 4; i++) {
    const v = passo * i;
    s += `<line class="grid-l" x1="${x(v)}" x2="${x(v)}" y1="${m.t - 6}" y2="${H - m.b}"/>`;
    s += `<text class="ax" x="${x(v)}" y="${H - 8}" text-anchor="middle">${nf1.format(v)} m</text>`;
  }
  s += `<line class="limit-l" x1="${x(lim)}" x2="${x(lim)}" y1="${m.t - 10}" y2="${H - m.b}"/>`;
  s += `<text class="lim-lab" x="${x(lim)}" y="${m.t - 14}" text-anchor="end">limite</text>`;
  const stats: Record<string, { mn: number; mx: number; md: number; q1: number; q3: number; n: number }> = {};
  TIPOS.forEach((t, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    const ms = E.filter(e => e.tipo === t.k).map(e => e.m).sort((a, b) => a - b);
    s += `<text class="ax-strong" x="0" y="${cy + 4}">${t.nome}</text>`;
    s += `<rect class="track-bg" x="${lw}" y="${cy - 9}" width="${iw}" height="18" rx="9"/>`;
    if (!ms.length) { s += `<text class="ax" x="${lw + 10}" y="${cy + 4}">sem encontros</text>`; return; }
    const mn = ms[0], mx = ms[ms.length - 1], md = quantile(ms, 0.5), q1 = quantile(ms, 0.25), q3 = quantile(ms, 0.75);
    stats[t.k] = { mn, mx, md, q1, q3, n: ms.length };
    s += `<rect class="m-${t.k}" opacity=".28" x="${x(mn)}" y="${cy - 9}" width="${Math.max(2, x(mx) - x(mn))}" height="18" rx="9"/>`;
    s += `<rect class="m-${t.k}" x="${x(q1)}" y="${cy - 9}" width="${Math.max(4, x(q3) - x(q1))}" height="18" rx="9"/>`;
    s += `<circle class="ring" cx="${x(md)}" cy="${cy}" r="6" fill="var(--ink)"/>`;
    s += `<text class="val-lab" x="${x(mx) + 8}" y="${cy + 4}">${nf1.format(md)} m</text>`;
    s += `<rect class="hit" data-tip="${t.k}" x="${lw}" y="${cy - 16}" width="${iw}" height="32"/>`;
  });
  el.innerHTML = `${s}</svg>`;
  bindTips(el, k => {
    const st = stats[k];
    if (!st) return '';
    return `<div class="tt">${TIPO[k as TipoEncontro].nome}: ${st.n} encontros</div>Mediana <b>${nf1.format(st.md)} m</b><br>Metade entre ${nf1.format(st.q1)} e ${nf1.format(st.q3)} m<br>Faixa ${nf1.format(st.mn)} a ${nf1.format(st.mx)} m`;
  });
}

/** Barra horizontal simples (rankings), com valor à direita. */
export function barraHtml(rotulo: string, valor: number, max: number, texto: string, cor = 'var(--bar)', attrs = ''): string {
  return `<div class="hbar" ${attrs}>
    <span class="hbar-r" title="${esc(rotulo.replace(/<[^>]*>/g, ''))}">${rotulo}</span>
    <span class="hbar-t"><span style="width:${max ? (valor / max) * 100 : 0}%;background:${cor}"></span></span>
    <span class="hbar-v">${texto}</span>
  </div>`;
}
