/** O que cada aba precisa oferecer ao main.ts. */
import type { IdAba } from '../nucleo/estado.js';
import type { EscopoFiltros } from '../nucleo/filtros.js';

export interface DefAba {
  id: IdAba;
  titulo: string;
  /** Quais filtros globais valem nesta aba. */
  escopo: EscopoFiltros;
  /** Número pequeno ao lado do nome da aba (ex.: violações). alerta = destacado. */
  contador?: () => { texto: string; alerta?: boolean } | null;
  render: (el: HTMLElement) => void;
  /** Redesenha só o que depende da largura (gráficos), sem refazer a aba inteira. */
  redimensionar?: () => void;
}
