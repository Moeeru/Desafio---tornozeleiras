/**
 * Mostra, em JSON, o que a detecção fez com cada registro e cada par de um instante.
 * Usado pela aba "Dados brutos" do BI (GET /api/brutos), mas pode ser rodado à mão:
 *
 *   node backend/dist/cli/explicar.js --dataset 1 --instante 0
 *   node backend/dist/cli/explicar.js --dataset 1 --ts "2024-01-01 00:16:45"
 */
import fs from 'fs';
import type { InstanteBruto } from '../../../shared/contrato';
import { arquivoDataset } from '../arquivos/datasets';
import { lerInstante, obterIndice } from '../arquivos/indice';
import { explicarInstante } from '../deteccao/explicacao';

function arg(nome: string): string | undefined {
  const a = process.argv.slice(2);
  const i = a.indexOf(`--${nome}`);
  if (i >= 0) return a[i + 1];
  return a.find(x => x.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');
}

function falhar(msg: string): never {
  process.stdout.write(JSON.stringify({ erro: msg }));
  process.exit(1);
}

const n = Number(arg('dataset'));
if (!Number.isInteger(n) || n < 1) falhar('Informe o dataset: --dataset N');
if (!fs.existsSync(arquivoDataset(n))) falhar(`Inputs/dataset${n}.txt não existe.`);

const idx = obterIndice(n);
if (!idx.offsets.length) falhar(`Inputs/dataset${n}.txt não tem nenhum instante válido.`);

let k: number;
const ts = arg('ts');
if (ts) {
  k = idx.ts.indexOf(ts);
  if (k < 0) falhar(`O instante "${ts}" não existe no dataset ${n}.`);
} else {
  k = Number(arg('instante') ?? 0);
  if (!Number.isInteger(k) || k < 0 || k >= idx.offsets.length) {
    falhar(`Instante fora do intervalo: use de 0 a ${idx.offsets.length - 1}.`);
  }
}

const resultado: InstanteBruto = {
  dataset: n,
  indice: k,
  totalInstantes: idx.offsets.length,
  ts: idx.ts[k],
  anterior: k > 0 ? idx.ts[k - 1] : null,
  proximo: k + 1 < idx.ts.length ? idx.ts[k + 1] : null,
  ...explicarInstante(lerInstante(n, idx, k))
};
process.stdout.write(JSON.stringify(resultado));
