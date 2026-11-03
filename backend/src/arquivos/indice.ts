/**
 * Índice de instantes de um dataset: onde começa cada instante no arquivo (byte e linha).
 * Permite ler um instante qualquer de um arquivo de 600 MB sem percorrê-lo de novo.
 * Fica em cache em metricas/indices/datasetN.json, invalidado quando o arquivo muda.
 */
import fs from 'fs';
import { arquivoDataset, arquivoIndice, PASTAS } from './datasets';
import type { LinhaNumerada } from '../deteccao/explicacao';

export interface IndiceInstantes {
  tamanho: number;
  modificado: number;
  /** Byte inicial de cada instante. */
  offsets: number[];
  /** Número da linha (1 = cabeçalho) onde cada instante começa. */
  linhas: number[];
  ts: string[];
  /** Total de linhas do arquivo, contando o cabeçalho. */
  totalLinhas: number;
}

const NL = 10, CR = 13, PV = 59, ASPAS = 34;

/** Timestamp de uma linha (3º campo), ou '' se a linha não tiver campos suficientes. */
function tsDaLinha(buf: Buffer, ini: number, fim: number): string {
  let p = ini, campo = 0, inicioTs = -1;
  for (; p < fim; p++) {
    if (buf[p] !== PV) continue;
    campo++;
    if (campo === 2) inicioTs = p + 1;
    else if (campo === 3) {
      let a = inicioTs, b = p;
      while (a < b && buf[a] === ASPAS) a++;
      while (b > a && buf[b - 1] === ASPAS) b--;
      return buf.toString('latin1', a, b).trim();
    }
  }
  return '';
}

function construir(n: number): IndiceInstantes {
  const arquivo = arquivoDataset(n);
  const st = fs.statSync(arquivo);
  const offsets: number[] = [], linhas: number[] = [], ts: string[] = [];
  const fd = fs.openSync(arquivo, 'r');
  const TAM = 4 << 20;
  let buf = Buffer.alloc(TAM + 4096);
  let carry = 0, base = 0, linha = 0, anterior = '';
  try {
    for (;;) {
      const lidos = fs.readSync(fd, buf, carry, TAM, null);
      const total = carry + lidos;
      if (total === 0) break;
      let ini = 0;
      for (;;) {
        let fim = buf.indexOf(NL, ini);
        if (fim === -1 || fim >= total) {
          if (lidos > 0) break;
          fim = total; // última linha sem quebra
          if (ini >= fim) break;
        }
        linha++;
        const fimTexto = fim > ini && buf[fim - 1] === CR ? fim - 1 : fim;
        if (linha > 1 && fimTexto > ini) {
          const t = tsDaLinha(buf, ini, fimTexto);
          if (t && t !== anterior) {
            offsets.push(base + ini);
            linhas.push(linha);
            ts.push(t);
            anterior = t;
          }
        }
        ini = fim + 1;
        if (fim === total) break;
      }
      if (lidos === 0) break;
      carry = total - ini;
      if (carry > 0) {
        if (carry > TAM) { const maior = Buffer.alloc(carry + TAM + 4096); buf.copy(maior, 0, ini, total); buf = maior; }
        else buf.copy(buf, 0, ini, total);
      }
      base += ini;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { tamanho: st.size, modificado: st.mtimeMs, offsets, linhas, ts, totalLinhas: linha };
}

export function obterIndice(n: number): IndiceInstantes {
  const st = fs.statSync(arquivoDataset(n));
  const cache = arquivoIndice(n);
  if (fs.existsSync(cache)) {
    try {
      const idx = JSON.parse(fs.readFileSync(cache, 'utf8')) as IndiceInstantes;
      if (idx.tamanho === st.size && idx.modificado === st.mtimeMs && typeof idx.totalLinhas === 'number') return idx;
    } catch { /* cache corrompido: reconstrói */ }
  }
  const idx = construir(n);
  fs.mkdirSync(PASTAS.indices, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(idx), 'utf8');
  return idx;
}

/** Posição do instante que contém a linha (o último que começa nela ou antes), ou -1. */
export function instanteDaLinha(idx: IndiceInstantes, linha: number): number {
  let lo = 0, hi = idx.linhas.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (idx.linhas[m] <= linha) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** Linhas do instante de posição k no índice, com o número de cada uma. */
export function lerInstante(n: number, idx: IndiceInstantes, k: number): LinhaNumerada[] {
  const ini = idx.offsets[k];
  const fim = k + 1 < idx.offsets.length ? idx.offsets[k + 1] : idx.tamanho;
  const fd = fs.openSync(arquivoDataset(n), 'r');
  const buf = Buffer.alloc(fim - ini);
  try {
    fs.readSync(fd, buf, 0, buf.length, ini);
  } finally {
    fs.closeSync(fd);
  }
  const partes = buf.toString('utf8').split('\n');
  if (partes.length && partes[partes.length - 1] === '') partes.pop();
  return partes
    .map((texto, i) => ({ linha: idx.linhas[k] + i, texto: texto.replace(/\r$/, '') }))
    .filter(l => l.texto.trim() !== '');
}
