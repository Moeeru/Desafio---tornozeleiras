/**
 * Remove um dataset incluído (número maior que 7): entrada, resposta, métricas e índice.
 * Os 7 datasets oficiais não podem ser removidos por aqui.
 *
 *   npm run remover -- 8
 */
import fs from 'fs';
import { arquivoDataset, arquivoIndice, arquivoResposta, DATASETS_OFICIAIS } from '../arquivos/datasets';
import { gravarExecucao, lerExecucao } from '../arquivos/metricas';

const json = process.argv.includes('--json');
const n = Number(process.argv.slice(2).find(a => !a.startsWith('--')));

function sair(ok: boolean, msg: string): never {
  if (json) process.stdout.write(`${JSON.stringify(ok ? { ok: true, mensagem: msg } : { erro: msg })}\n`);
  else (ok ? console.log : console.error)(ok ? msg : `[ERRO] ${msg}`);
  process.exit(ok ? 0 : 1);
}

if (!Number.isInteger(n) || n <= DATASETS_OFICIAIS) {
  sair(false, `Informe um dataset incluído (número maior que ${DATASETS_OFICIAIS}). Os oficiais não são removidos.`);
}
if (!fs.existsSync(arquivoDataset(n))) sair(false, `Inputs/dataset${n}.txt não existe.`);

for (const f of [arquivoDataset(n), arquivoResposta(n), arquivoIndice(n)]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
const metricas = lerExecucao();
metricas.delete(n);
gravarExecucao(metricas);
sair(true, `Dataset ${n} removido.`);
