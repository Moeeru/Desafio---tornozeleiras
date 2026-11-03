/** Tabela com ordenação por coluna e paginação, reaproveitada pelas abas de registros. */
import { onEach } from '../nucleo/dom.js';
import { nf } from '../nucleo/formato.js';
import type { Ordenacao } from '../nucleo/estado.js';

export interface Coluna<T> {
  k: string;
  l: string;
  /** Valor usado na ordenação. null = coluna não ordenável. */
  v: ((x: T) => number | string) | null;
  html: (x: T) => string;
  r?: boolean;
}

export function ordenar<T>(rows: T[], cols: Coluna<T>[], sort: Ordenacao): T[] {
  const col = cols.find(c => c.k === sort.key);
  if (!col || !col.v) return rows;
  const get = col.v;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
}

export interface Pagina<T> { itens: T[]; pagina: number; paginas: number; inicio: number; fim: number }

export function paginar<T>(rows: T[], pagina: number, tamanho: number): Pagina<T> {
  const size = tamanho || rows.length || 1;
  const paginas = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, pagina), paginas);
  const inicio = (p - 1) * size;
  const fim = Math.min(rows.length, inicio + size);
  return { itens: rows.slice(inicio, fim), pagina: p, paginas, inicio, fim };
}

export function tabelaHtml<T>(prefixo: string, cols: Coluna<T>[], itens: T[], sort: Ordenacao | null, vazioMsg: string): string {
  const head = cols.map(c => {
    const cls = c.r ? ' class="r"' : '';
    if (!c.v || !sort) return `<th scope="col"${cls}>${c.l}</th>`;
    const on = sort.key === c.k;
    const aria = on ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : '';
    return `<th scope="col"${cls}><button type="button" id="${prefixo}-s-${c.k}" data-k="${c.k}"${aria}>${c.l} <span aria-hidden="true">${on ? (sort.dir > 0 ? '↑' : '↓') : ''}</span></button></th>`;
  }).join('');
  const body = itens.length
    ? itens.map(x => `<tr>${cols.map(c => `<td${c.r ? ' class="r"' : ''}>${c.html(x)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="vazio-td">${vazioMsg}</td></tr>`;
  return `<div class="tablewrap"><table id="${prefixo}-tab"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Liga os cabeçalhos ordenáveis. Clicar de novo na mesma coluna inverte a ordem. */
export function ligarOrdenacao(root: ParentNode, prefixo: string, sort: Ordenacao, aplicar: (s: Ordenacao) => void, decrescentes: string[] = []): void {
  onEach<HTMLButtonElement>(root, `[id^="${prefixo}-s-"]`, b => {
    const k = b.dataset.k ?? '';
    aplicar({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : decrescentes.includes(k) ? -1 : 1 });
  });
}

export function paginacaoHtml(prefixo: string, p: Pagina<unknown>, total: number, tamanho: number): string {
  return `<div class="pager">
    <span class="count">${total ? `Mostrando <b>${p.inicio + 1}–${p.fim}</b> de <b>${nf.format(total)}</b>` : 'Nenhum resultado'}</span>
    <span class="pager-c">
      <label for="${prefixo}-size">Linhas</label>
      <select class="field" id="${prefixo}-size">${[25, 50, 100, 0].map(n =>
        `<option value="${n}"${n === tamanho ? ' selected' : ''}>${n || 'Todas'}</option>`).join('')}</select>
      <button type="button" class="btn" id="${prefixo}-prev"${p.pagina <= 1 ? ' disabled' : ''}>Anterior</button>
      <span>${p.pagina} de ${p.paginas}</span>
      <button type="button" class="btn" id="${prefixo}-next"${p.pagina >= p.paginas ? ' disabled' : ''}>Próxima</button>
    </span>
  </div>`;
}
