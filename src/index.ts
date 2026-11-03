import fs from 'fs';
import path from 'path';
import { EncounterDetector } from './detector';
import { EncounterType, ProcessingResult } from './types';

async function main() {
  const args = process.argv.slice(2);
  let datasetArg: number | null = null;
  let runAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all' || arg === '-a') {
      runAll = true;
    } else if (arg.startsWith('--dataset=')) {
      datasetArg = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-d' || arg === '--dataset') {
      datasetArg = parseInt(args[++i], 10);
    }
  }

  // Padrão: se nenhum argumento for passado, executa todos os 7 datasets
  if (!datasetArg) {
    runAll = true;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const inputsDir = path.join(projectRoot, 'Inputs');
  const outputsDir = path.join(projectRoot, 'outputs');

  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }

  const detector = new EncounterDetector();
  const datasetsToRun = runAll ? [1, 2, 3, 4, 5, 6, 7] : [datasetArg!];

  console.log('================================================================');
  console.log('      SISTEMA DE DETECÇÃO DE ENCONTROS - MONITORAMENTO PENAL     ');
  console.log('================================================================');
  console.log(`Diretório de Entrada : ${inputsDir}`);
  console.log(`Diretório de Saída   : ${outputsDir}`);
  console.log(`Datasets selecionados: ${datasetsToRun.join(', ')}\n`);

  const results: ProcessingResult[] = [];
  let totalStartTime = performance.now();

  for (const dsNum of datasetsToRun) {
    const fileName = `dataset${dsNum}.txt`;
    const inputPath = path.join(inputsDir, fileName);
    const outputPath = path.join(outputsDir, `respostas${dsNum}.json`);

    if (!fs.existsSync(inputPath)) {
      console.error(`[ERRO] Arquivo de entrada não encontrado: ${inputPath}`);
      continue;
    }

    const fileStats = fs.statSync(inputPath);
    const sizeMb = (fileStats.size / (1024 * 1024)).toFixed(1);

    process.stdout.write(`Processando ${fileName} (${sizeMb} MB)... `);
    const start = performance.now();
    const encounters = await detector.processFile(inputPath);
    const durationMs = performance.now() - start;

    // Salva o JSON de saída formatado com 2 espaços
    fs.writeFileSync(outputPath, JSON.stringify(encounters, null, 2), 'utf8');

    const breakdown: Record<EncounterType, number> = {
      generico: 0,
      faccao: 0,
      protetiva: 0
    };
    for (const enc of encounters) {
      breakdown[enc.tipo]++;
    }

    results.push({
      datasetName: `dataset${dsNum}`,
      filePath: inputPath,
      outputPath,
      encounters,
      durationMs,
      breakdown
    });

    console.log(
      `Concluído em ${(durationMs / 1000).toFixed(2)}s! ` +
      `Encontros: ${encounters.length} ` +
      `(Genéricos: ${breakdown.generico}, Facções: ${breakdown.faccao}, Protetivas: ${breakdown.protetiva})`
    );
  }

  const totalDurationSeconds = ((performance.now() - totalStartTime) / 1000).toFixed(2);

  console.log('\n======================== RESUMO DA EXECUÇÃO ========================');
  console.table(
    results.map(r => ({
      Dataset: r.datasetName,
      Encontros: r.encounters.length,
      Genérico: r.breakdown.generico,
      Facção: r.breakdown.faccao,
      Protetiva: r.breakdown.protetiva,
      'Tempo (s)': (r.durationMs / 1000).toFixed(3)
    }))
  );

  const totalEncounters = results.reduce((acc, r) => acc + r.encounters.length, 0);
  const avgTime = (
    results.reduce((acc, r) => acc + r.durationMs, 0) /
    results.length /
    1000
  ).toFixed(3);

  console.log(`Total de encontros detectados: ${totalEncounters}`);
  console.log(`Tempo total decorrido        : ${totalDurationSeconds} s`);
  console.log(`Tempo médio por dataset      : ${avgTime} s`);
  console.log('====================================================================\n');
}

main().catch(err => {
  console.error('[ERRO FATAL]:', err);
  process.exit(1);
});

