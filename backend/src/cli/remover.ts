/**
 * Remove um dataset incluído: arquivo de entrada, resposta, métricas, índice e entrada no catálogo.
 * Os oficiais (datasetsOficiais em radar.config.json) não podem ser removidos por aqui.
 *
 *   npm run remover -- 8
 */
import fs from 'fs';
import path from 'path';
import { arquivoIndice, arquivoResposta, catalogo, PASTAS, retirarDoCatalogo } from '../arquivos/datasets';
import { gravarExecucao, lerExecucao } from '../arquivos/metricas';

const json = process.argv.includes('--json');
const n = Number(process.argv.slice(2).find(a => !a.startsWith('--')));

function sair(ok: boolean, msg: string): never {
  if (json) process.stdout.write(`${JSON.stringify(ok ? { ok: true, mensagem: msg } : { erro: msg })}\n`);
  else (ok ? console.log : console.error)(ok ? msg : `[ERRO] ${msg}`);
  process.exit(ok ? 0 : 1);
}

const d = catalogo(true).find(x => x.n === n);
const incluidos = catalogo().filter(x => !x.oficial).map(x => `${x.n} (${x.arquivo})`).join(', ') || 'nenhum';
if (!Number.isInteger(n) || !d) sair(false, `Informe o número de um dataset incluído. Incluídos: ${incluidos}.`);
if (d.oficial) sair(false, `O dataset ${n} (${d.arquivo}) é oficial e não pode ser removido.`);

for (const f of [path.join(PASTAS.inputs, d.arquivo), arquivoResposta(n), arquivoIndice(n)]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
retirarDoCatalogo(n);
const metricas = lerExecucao();
metricas.delete(n);
gravarExecucao(metricas);
sair(true, `Dataset ${n} (${d.arquivo}) removido.`);
