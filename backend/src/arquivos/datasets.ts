/** Onde ficam os arquivos do projeto e quais datasets existem. */
import fs from 'fs';
import path from 'path';
import { RAIZ } from './raiz';

/** Os 7 datasets do desafio. Os de número maior foram incluídos depois. */
export const DATASETS_OFICIAIS = 7;

export const PASTAS = {
  inputs: path.join(RAIZ, 'Inputs'),
  outputs: path.join(RAIZ, 'outputs'),
  metricas: path.join(RAIZ, 'metricas'),
  indices: path.join(RAIZ, 'metricas', 'indices'),
  gabaritos: path.join(RAIZ, 'Respostas esperadas')
};

export const CABECALHO = 'idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida';

export const arquivoDataset = (n: number): string => path.join(PASTAS.inputs, `dataset${n}.txt`);
export const arquivoResposta = (n: number): string => path.join(PASTAS.outputs, `respostas${n}.json`);
export const arquivoIndice = (n: number): string => path.join(PASTAS.indices, `dataset${n}.json`);

/** Números dos arquivos Inputs/datasetN.txt existentes, em ordem. */
export function listarDatasets(): number[] {
  if (!fs.existsSync(PASTAS.inputs)) return [];
  return fs.readdirSync(PASTAS.inputs)
    .map(nome => /^dataset(\d+)\.txt$/i.exec(nome))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => Number(m[1]))
    .filter(n => n > 0)
    .sort((a, b) => a - b);
}

/** Próximo número livre para um dataset incluído (sempre depois dos oficiais). */
export function proximoNumero(): number {
  return Math.max(DATASETS_OFICIAIS, ...listarDatasets()) + 1;
}

/** Confere o cabeçalho do arquivo. Retorna a mensagem de erro, ou null se estiver certo. */
export function validarCabecalho(arquivo: string): string | null {
  const fd = fs.openSync(arquivo, 'r');
  const buf = Buffer.alloc(1024);
  let lidos = 0;
  try {
    lidos = fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (lidos === 0) return 'O arquivo está vazio.';
  const primeira = buf.toString('utf8', 0, lidos).split(/\r?\n/)[0].replace(new RegExp('^' + String.fromCharCode(0xfeff)), '') /* BOM */.replace(/["\s]/g, '');
  if (primeira.toLowerCase() !== CABECALHO.toLowerCase()) {
    return `A primeira linha precisa ser o cabeçalho "${CABECALHO}". Encontrado: "${primeira.slice(0, 120)}".`;
  }
  return null;
}
