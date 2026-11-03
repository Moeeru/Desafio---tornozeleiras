/**
 * Processa os datasets da pasta de entradas e grava outputs/respostasN.json e metricas/execucao.json.
 * Pastas e datasets oficiais vêm de radar.config.json; qualquer outro arquivo com extensão aceita
 * colocado na pasta de entradas entra no catálogo (metricas/datasets.json) com o próximo número.
 *
 *   npm start               todos os datasets presentes
 *   npm start -- -d 3       só o dataset 3
 */
import fs from 'fs';
import { arquivoDataset, catalogo, nomeDataset, PASTAS, relativo, validarCabecalho } from '../arquivos/datasets';
import { ARQUIVO_EXECUCAO, gravarExecucao, lerExecucao } from '../arquivos/metricas';
import { EncounterDetector } from '../deteccao/detector';
import { processarDataset, resumoFalhas, type ResultadoDataset } from '../processamento';

function lerArgumentos(): number | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--dataset=')) return Number(a.split('=')[1]);
    if (a === '-d' || a === '--dataset') return Number(args[i + 1]);
  }
  return null;
}

async function main(): Promise<void> {
  const lista = catalogo(true);
  const presentes = lista.filter(d => d.existe);
  const pedido = lerArgumentos();
  if (pedido !== null && !presentes.some(d => d.n === pedido)) {
    const quais = presentes.map(d => `${d.n} (${d.arquivo})`).join(', ') || 'nenhum';
    console.error(`[ERRO] Dataset inválido: ${pedido}. Disponíveis em ${relativo(PASTAS.inputs)}/: ${quais}. Exemplo: npm start -- -d 3`);
    process.exit(1);
  }
  const ausentes = lista.filter(d => d.oficial && !d.existe);
  if (pedido === null && ausentes.length) {
    console.warn(`[AVISO] Datasets oficiais ausentes em ${relativo(PASTAS.inputs)}/: ${ausentes.map(d => d.arquivo).join(', ')}.`);
  }
  // Arquivos sem o cabeçalho esperado ficam de fora (com aviso), em vez de gerar uma resposta vazia
  const fila = (pedido !== null ? [pedido] : presentes.map(d => d.n)).filter(n => {
    const erro = validarCabecalho(arquivoDataset(n));
    if (erro) console.warn(`[AVISO] ${nomeDataset(n)} ignorado: ${erro}`);
    return !erro;
  });
  if (!fila.length) {
    console.error(`[ERRO] Nenhum arquivo de dados válido em ${PASTAS.inputs}.`);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('      SISTEMA DE DETECÇÃO DE ENCONTROS - MONITORAMENTO PENAL     ');
  console.log('================================================================');
  console.log(`Diretório de Entrada : ${PASTAS.inputs}`);
  console.log(`Diretório de Saída   : ${PASTAS.outputs}`);
  console.log(`Datasets selecionados: ${fila.map(n => `${n} (${nomeDataset(n)})`).join(', ')}\n`);

  const metricas = lerExecucao();
  const detector = new EncounterDetector();
  const resultados: ResultadoDataset[] = [];
  const inicioTotal = performance.now();

  for (const n of fila) {
    const arquivo = arquivoDataset(n);
    const mb = (fs.statSync(arquivo).size / 1048576).toFixed(1);
    process.stdout.write(`Processando ${nomeDataset(n)} (${mb} MB)... `);
    const r = await processarDataset(n, detector);
    resultados.push(r);
    metricas.set(n, r.metricas);
    const b = r.metricas.breakdown;
    console.log(
      `Concluído em ${(r.metricas.processMs / 1000).toFixed(2)}s (com gravação: ${(r.metricas.totalMs / 1000).toFixed(2)}s)! ` +
      `Encontros: ${r.encontros.length} (Genéricos: ${b.generico}, Facções: ${b.faccao}, Protetivas: ${b.protetiva})`
    );
    const falhas = resumoFalhas(r.metricas);
    if (falhas) console.warn(`  [AVISO] Falhas na coleta: ${falhas}. Detalhes na aba "Qualidade da coleta" do BI.`);
  }

  gravarExecucao(metricas);

  console.log('\n======================== RESUMO DA EXECUÇÃO ========================');
  console.table(resultados.map(r => ({
    Dataset: `${r.metricas.dataset} · ${nomeDataset(r.metricas.dataset)}`,
    Encontros: r.encontros.length,
    Genérico: r.metricas.breakdown.generico,
    Facção: r.metricas.breakdown.faccao,
    Protetiva: r.metricas.breakdown.protetiva,
    'Tempo (s)': (r.metricas.processMs / 1000).toFixed(3)
  })));
  const total = resultados.reduce((s, r) => s + r.encontros.length, 0);
  const media = resultados.reduce((s, r) => s + r.metricas.processMs, 0) / resultados.length / 1000;
  console.log(`Total de encontros detectados: ${total}`);
  console.log(`Tempo total decorrido        : ${((performance.now() - inicioTotal) / 1000).toFixed(2)} s`);
  console.log(`Tempo médio por dataset      : ${media.toFixed(3)} s`);
  console.log(`Métricas para o BI           : ${ARQUIVO_EXECUCAO}`);
  console.log('====================================================================\n');
}

main().catch(err => {
  console.error('[ERRO FATAL]:', err);
  process.exit(1);
});
