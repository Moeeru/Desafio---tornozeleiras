import type { TipoEncontro } from '../../../../shared/contrato.js';

export interface TipoInfo {
  k: TipoEncontro;
  nome: string;
  desc: string;
}

/** Ordem de leitura: do mais grave ao mais comum. */
export const TIPOS: TipoInfo[] = [
  { k: 'protetiva', nome: 'Protetiva', desc: 'agressor perto da vítima' },
  { k: 'faccao', nome: 'Facção', desc: 'membros da mesma facção' },
  { k: 'generico', nome: 'Genérico', desc: 'demais monitorados' }
];
export const TIPO = Object.fromEntries(TIPOS.map(t => [t.k, t])) as Record<TipoEncontro, TipoInfo>;

/** Ordem de empilhamento nos gráficos: base → topo. */
export const STACK: TipoEncontro[] = ['generico', 'faccao', 'protetiva'];

/** Cor da série (token CSS). */
export const sw = (k: TipoEncontro): string => `var(--s-${k})`;

/** Um registro a cada 5 segundos, por especificação do desafio. */
export const INTERVALO_LEITURA_MS = 5000;
