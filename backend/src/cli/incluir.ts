/**
 * Inclui um novo arquivo de dados: confere o formato, copia para Inputs/datasetN.txt
 * (próximo número livre depois dos 7 oficiais) e já processa.
 *
 *   npm run incluir -- caminho/do/arquivo.txt
 *
 * Opções: --mover (move em vez de copiar) e --json (última linha da saída em JSON, usada pelo BI).
 */
import fs from 'fs';
import path from 'path';
import type { ResultadoInclusao } from '../../../shared/contrato';
import { arquivoDataset, PASTAS, proximoNumero, validarCabecalho } from '../arquivos/datasets';
import { gravarExecucao, lerExecucao } from '../arquivos/metricas';
import { processarDataset, resumoFalhas } from '../processamento';

const args = process.argv.slice(2);
const json = args.includes('--json');
const mover = args.includes('--mover');
const origem = args.find(a => !a.startsWith('--'));

function falhar(msg: string): never {
  if (json) process.stdout.write(`${JSON.stringify({ erro: msg })}\n`);
  else console.error(`[ERRO] ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!origem) falhar('Informe o arquivo: npm run incluir -- caminho/do/arquivo.txt');
  const caminho = path.resolve(origem);
  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) falhar(`Arquivo não encontrado: ${caminho}`);
  const erro = validarCabecalho(caminho);
  if (erro) falhar(erro);

  const n = proximoNumero();
  const destino = arquivoDataset(n);
  fs.mkdirSync(PASTAS.inputs, { recursive: true });
  if (mover) {
    try { fs.renameSync(caminho, destino); } catch { fs.copyFileSync(caminho, destino); fs.unlinkSync(caminho); }
  } else {
    fs.copyFileSync(caminho, destino);
  }
  if (!json) console.log(`Arquivo incluído como ${path.relative(process.cwd(), destino)}. Processando...`);

  const r = await processarDataset(n);
  const metricas = lerExecucao();
  metricas.set(n, r.metricas);
  gravarExecucao(metricas);

  const falhas = Object.values(r.metricas.falhas).reduce((s, f) => s + (f?.total ?? 0), 0);
  const resultado: ResultadoInclusao = {
    dataset: n, arquivo: `Inputs/dataset${n}.txt`, encontros: r.encontros.length, registros: r.metricas.records, falhas
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(resultado)}\n`);
  } else {
    console.log(`Dataset ${n}: ${r.metricas.records} registros, ${r.encontros.length} encontros.`);
    const resumo = resumoFalhas(r.metricas);
    console.log(resumo ? `Falhas na coleta: ${resumo}.` : 'Nenhuma falha na coleta.');
    console.log('Abra o BI (npm run bi:serve) para ver os resultados.');
  }
}

main().catch(err => falhar(err instanceof Error ? err.message : String(err)));
