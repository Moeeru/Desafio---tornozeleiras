/**
 * Uma página da tabela de dados brutos: as linhas dos arquivos em ordem (dataset, depois linha),
 * cada uma com o tratamento que recebeu e a distância até a pessoa mais próxima no mesmo instante.
 * Usado pela aba "Dados brutos" do BI (GET /api/brutos), mas pode ser rodado à mão:
 *
 *   node backend/dist/cli/brutos.js                         todos os datasets, página 1
 *   node backend/dist/cli/brutos.js --dataset 3 --pagina 2 --tamanho 100
 *
 * Para calcular as distâncias de uma linha é preciso o instante inteiro; o comando lê só os
 * instantes que cobrem a página pedida, usando o índice de cada arquivo (metricas/indices/).
 */
import type { PaginaBrutos, RegistroBruto } from '../../../shared/contrato';
import { listarDatasets } from '../arquivos/datasets';
import { instanteDaLinha, lerInstante, obterIndice } from '../arquivos/indice';
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

const disponiveis = listarDatasets();
const pedido = arg('dataset');
const umDataset = pedido && pedido !== 'todos' ? Number(pedido) : null;
if (umDataset !== null && !disponiveis.includes(umDataset)) falhar(`O dataset ${pedido} não existe ou o arquivo dele não está na pasta de entradas.`);
const tamanho = Math.min(1000, Math.max(1, Number(arg('tamanho') ?? 100) || 100));
const paginaPedida = Math.max(1, Number(arg('pagina') ?? 1) || 1);

const fontes = (umDataset !== null ? [umDataset] : disponiveis).map(n => ({ n, idx: obterIndice(n) }));
const totais = fontes.map(f => ({ dataset: f.n, registros: Math.max(0, f.idx.totalLinhas - 1) }));
const total = totais.reduce((s, t) => s + t.registros, 0);
const paginas = Math.max(1, Math.ceil(total / tamanho));
const pagina = Math.min(paginaPedida, paginas);
const inicio = (pagina - 1) * tamanho;
const fim = Math.min(total, inicio + tamanho);

const registros: RegistroBruto[] = [];
let antes = 0;
for (const { n, idx } of fontes) {
  const qtd = Math.max(0, idx.totalLinhas - 1);
  const a = Math.max(inicio, antes), b = Math.min(fim, antes + qtd);
  if (a < b) {
    // Registro r do dataset (0 = primeira linha de dados) é a linha r + 2 do arquivo
    const linhaIni = a - antes + 2, linhaFim = b - antes + 1;
    const k0 = Math.max(0, instanteDaLinha(idx, linhaIni)), k1 = instanteDaLinha(idx, linhaFim);
    for (let k = k0; k <= k1; k++) {
      const { registros: regs } = explicarInstante(lerInstante(n, idx, k));
      for (const r of regs) {
        if (r.linha >= linhaIni && r.linha <= linhaFim) registros.push({ ...r, ds: n, ts: idx.ts[k] });
      }
    }
  }
  antes += qtd;
}

const resultado: PaginaBrutos = { dataset: umDataset, pagina, tamanho, paginas, total, totaisPorDataset: totais, registros };
process.stdout.write(JSON.stringify(resultado));
