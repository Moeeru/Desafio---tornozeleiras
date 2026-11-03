import fs from 'fs';
import os from 'os';
import path from 'path';
import { EncounterDetector } from '../deteccao/detector';
import { haversineDistance, isWithinBoundingBox, DEFAULT_EARTH_RADIUS_METERS } from '../deteccao/haversine';
import { classifyEncounter } from '../deteccao/classifier';
import { Encounter, MonitoredEntity } from '../deteccao/types';
import { RAIZ } from '../arquivos/raiz';
import { arquivoDataset, PASTAS } from '../arquivos/datasets';
import { ARQUIVO_VALIDACAO } from '../arquivos/metricas';
import type { Validacao } from '../../../shared/contrato';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n--- INICIANDO TESTES UNITÁRIOS E DE INTEGRAÇÃO ---\n');

  // Teste 1: Cálculo de Haversine
  console.log('1. Teste de Precisão da Fórmula de Haversine:');
  const dZero = haversineDistance(0, 0, 0, 0);
  assert(dZero === 0, 'Distância entre pontos idênticos deve ser 0');

  // 1 grau de latitude no equador: 2 * PI * 6371000 / 360 ≈ 111194.9266m
  const d1DegLat = haversineDistance(0, 0, 1, 0);
  assert(Math.abs(d1DegLat - 111194.9266) < 0.1, `1 grau de latitude deve ser ~111.195m (obtido: ${d1DegLat.toFixed(2)}m)`);

  // Teste 2: Pré-filtro Bounding Box
  console.log('\n2. Teste de Segurança do Bounding Box:');
  // Ponto a 15 metros (~0.000135 graus de latitude)
  const latBase = -23.55052;
  const lonBase = -46.63330;
  const latClose = latBase + 0.000135;
  const distClose = haversineDistance(latBase, lonBase, latClose, lonBase);
  assert(distClose < 20, `Ponto de teste está a ${distClose.toFixed(2)}m (< 20m)`);
  assert(isWithinBoundingBox(latBase, lonBase, latClose, lonBase) === true, 'Bounding box NÃO deve filtrar pontos dentro do raio de 20m');

  // Ponto a 100 metros
  const latFar = latBase + 0.001;
  assert(isWithinBoundingBox(latBase, lonBase, latFar, lonBase) === false, 'Bounding box DEVE filtrar pontos distantes com segurança');

  // Teste 3: Regras de Negócio e Classificação
  console.log('\n3. Teste das Regras de Classificação e Prioridade:');

  const pMonitoradoA: MonitoredEntity = {
    id: 1,
    faccao: 'CV',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoB: MonitoredEntity = {
    id: 2,
    faccao: 'CV',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoC: MonitoredEntity = {
    id: 3,
    faccao: 'PCC',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoSemFaccao: MonitoredEntity = {
    id: 4,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pVitima: MonitoredEntity = {
    id: 10,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: true,
    idsRestricaoMedida: [1] // restrição contra id 1
  };

  const pOutraVitima: MonitoredEntity = {
    id: 11,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: true,
    idsRestricaoMedida: [2]
  };

  assert(classifyEncounter(pMonitoradoA, pMonitoradoB) === 'faccao', 'Dois monitorados da mesma facção devem gerar encontro "faccao"');
  assert(classifyEncounter(pMonitoradoA, pMonitoradoC) === 'generico', 'Dois monitorados de facções diferentes devem gerar encontro "generico"');
  assert(classifyEncounter(pMonitoradoA, pMonitoradoSemFaccao) === 'generico', 'Monitorado com facção e monitorado sem facção devem gerar encontro "generico"');
  assert(classifyEncounter(pVitima, pMonitoradoA) === 'protetiva', 'Vítima e seu respectivo agressor restrito devem gerar encontro "protetiva"');
  assert(classifyEncounter(pMonitoradoA, pVitima) === 'protetiva', 'Ordem dos parâmetros não deve alterar classificação "protetiva"');
  assert(classifyEncounter(pVitima, pMonitoradoB) === null, 'Vítima e monitorado que não consta na restrição NÃO devem gerar encontro (retorna null)');
  assert(classifyEncounter(pVitima, pOutraVitima) === null, 'Encontro entre duas vítimas NÃO deve gerar encontro (retorna null)');

  const detector = new EncounterDetector();
  const rootDir = RAIZ;

  /** Chave única de um encontro: timestamp + par de ids em ordem crescente. */
  const keyOf = (e: Encounter) => {
    const [a, b] = [...e.monitoradosEncontro].sort((x, y) => x - y);
    return `${e.timestamp}|${a}-${b}`;
  };

  /** Resultado de cada comparação, gravado em metricas/validacao.json para o BI. */
  const validacao: Array<{
    dataset: number; fonte: 'gabarito' | 'referencia'; esperados: number; gerados: number;
    corretos: number; faltando: number; extras: number; tipoErrado: number; distanciaDiferente: number;
  }> = [];

  /** Compara uma lista gerada com uma esperada: contagem, pares, tipos e distâncias. */
  function compareEncounters(
    label: string, generated: Encounter[], expected: Encounter[],
    meta: { dataset: number; fonte: 'gabarito' | 'referencia' }
  ) {
    assert(
      generated.length === expected.length,
      `${label}: quantidade de encontros deve ser ${expected.length} (obtido: ${generated.length})`
    );
    const byKey = new Map(generated.map(g => [keyOf(g), g]));
    const expectedKeys = new Set(expected.map(keyOf));
    const problems: string[] = [];
    let corretos = 0, faltando = 0, tipoErrado = 0, distanciaDiferente = 0;
    for (const exp of expected) {
      const got = byKey.get(keyOf(exp));
      if (!got) { faltando++; problems.push(`faltando ${keyOf(exp)}`); }
      else if (got.tipo !== exp.tipo) { tipoErrado++; problems.push(`tipo errado em ${keyOf(exp)}: ${got.tipo} ≠ ${exp.tipo}`); }
      else if (Math.abs(got.distanciaMetros - exp.distanciaMetros) > 1e-6) { distanciaDiferente++; problems.push(`distância diferente em ${keyOf(exp)}`); }
      else corretos++;
    }
    const extras = generated.filter(g => !expectedKeys.has(keyOf(g))).length;
    validacao.push({
      ...meta, esperados: expected.length, gerados: generated.length,
      corretos, faltando, extras, tipoErrado, distanciaDiferente
    });
    assert(
      problems.length === 0 && extras === 0,
      `${label}: encontros, tipos e distâncias coincidem` +
        (problems.length || extras ? ` (${[...problems.slice(0, 3), extras ? `${extras} a mais` : ''].filter(Boolean).join('; ')})` : '')
    );
  }

  // Teste 4: Validação contra os gabaritos oficiais. Arquivo ausente conta como falha.
  console.log('\n4. Teste de Validação com os Datasets Oficiais de Teste:');
  for (const n of [1, 2]) {
    const dsPath = arquivoDataset(n);
    const expPath = path.join(PASTAS.gabaritos, `respostas${n}.json`);
    const missing = [dsPath, expPath].filter(p => !fs.existsSync(p));
    if (missing.length) {
      assert(false, `Dataset ${n}: arquivo(s) não encontrado(s): ${missing.join(', ')}`);
      continue;
    }
    const generated = await detector.processFile(dsPath);
    const expected: Encounter[] = JSON.parse(fs.readFileSync(expPath, 'utf8'));
    compareEncounters(`Dataset ${n}`, generated, expected, { dataset: n, fonte: 'gabarito' });
  }

  // Teste 5: Regressão contra implementação de referência (força bruta, sem bounding box,
  // agrupando por timestamp no arquivo inteiro). Valida o pré-filtro e a suposição de
  // que os timestamps chegam em sequência, nos datasets sem gabarito.
  console.log('\n5. Teste de Regressão contra Implementação de Referência:');
  for (const n of [3, 4, 5]) {
    const dsPath = arquivoDataset(n);
    if (!fs.existsSync(dsPath)) {
      assert(false, `Dataset ${n}: arquivo não encontrado: ${dsPath}`);
      continue;
    }
    const generated = await detector.processFile(dsPath);
    const reference = referenceDetect(fs.readFileSync(dsPath, 'utf8'));
    compareEncounters(`Dataset ${n} (referência)`, generated, reference, { dataset: n, fonte: 'referencia' });
  }

  // Teste 6: Auditoria da coleta e funil, num arquivo com uma falha de cada tipo
  console.log('\n6. Teste da Auditoria de Qualidade da Coleta (exemplos/dataset-com-falhas.txt):');
  const falhasPath = path.join(rootDir, 'exemplos', 'dataset-com-falhas.txt');
  if (!fs.existsSync(falhasPath)) {
    assert(false, `Arquivo de exemplo não encontrado: ${falhasPath}`);
  } else {
    const det = new EncounterDetector();
    const enc = await det.processFile(falhasPath);
    const f = det.lastRun.falhas;
    const esperado: Record<string, number> = {
      linha_invalida: 1, coordenada_invalida: 1, id_invalido: 1, leitura_duplicada: 1, fora_de_ordem: 1,
      instante_repetido: 1, timestamp_invalido: 1, cadastro_inconsistente: 2, restricao_desconhecida: 1, leitura_ausente: 12
    };
    for (const [tipo, total] of Object.entries(esperado)) {
      const obtido = f[tipo as keyof typeof f]?.total ?? 0;
      assert(obtido === total, `Falha "${tipo}": ${total} esperada(s) (obtido: ${obtido})`);
    }
    assert(f.linha_invalida?.exemplos[0]?.linha === 7, 'Exemplo de linha inválida aponta a linha 7 do arquivo');
    assert(
      enc.length === 2 && !enc.some(e => e.monitoradosEncontro[0] === e.monitoradosEncontro[1]),
      `Leitura duplicada não gera encontro de um id consigo mesmo (2 encontros esperados, obtido: ${enc.length})`
    );
    const fu = det.lastRun.funil;
    assert(
      fu.linhasLidas === 17 && fu.registrosValidos === 12 && fu.registrosDescartados === 4 && fu.instantes === 3,
      `Funil de registros: 17 lidas, 12 válidas, 4 descartadas, 3 instantes (obtido: ${fu.linhasLidas}, ${fu.registrosValidos}, ${fu.registrosDescartados}, ${fu.instantes})`
    );
    assert(
      fu.paresComparados === 20 && fu.paresPreFiltro === 3 && fu.paresProximos === 3 && fu.paresIgnorados === 1 &&
        fu.encontros === 2 && fu.registrosEmEncontro === 3,
      `Funil de pares: 20 comparados, 3 no pré-filtro, 3 próximos, 1 ignorado, 2 encontros, 3 registros úteis (obtido: ${fu.paresComparados}, ${fu.paresPreFiltro}, ${fu.paresProximos}, ${fu.paresIgnorados}, ${fu.encontros}, ${fu.registrosEmEncontro})`
    );
  }

  // Teste 7: Arquivos oficiais limpos não geram nenhuma falha de coleta
  console.log('\n7. Teste de Qualidade dos Datasets Oficiais 1 a 5:');
  for (const n of [1, 2, 3, 4, 5]) {
    const dsPath = arquivoDataset(n);
    if (!fs.existsSync(dsPath)) { assert(false, `Dataset ${n}: arquivo não encontrado`); continue; }
    const det = new EncounterDetector();
    await det.processFile(dsPath);
    const total = Object.values(det.lastRun.falhas).reduce((s, x) => s + (x?.total ?? 0), 0);
    assert(total === 0, `Dataset ${n}: nenhuma falha de coleta (obtido: ${total})`);
  }

  // Teste 8: a leitura em bytes (processFile) dá exatamente o mesmo resultado da versão com readline
  console.log('\n8. Teste de Equivalência da Leitura em Bytes com a Versão Anterior (readline):');
  const limites = path.join(os.tmpdir(), `radar-casos-limite-${process.pid}.txt`);
  fs.writeFileSync(limites, [
    String.fromCharCode(0xfeff) + 'idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida',
    '1;7;"2024-01-01 00:00:00";-23.55000;-46.63000;false;',
    '2;"7";"2024-01-01 00:00:00";-23.55005;-46.63000;false;',         // facção entre aspas
    ' 3; ;" 2024-01-01 00:00:00 ";-23.55010; -46.63000;FALSE;',        // espaços e maiúsculas
    '4;;"2024-01-01 00:00:00";-2.355e1;-46.63001;TRUE;" 2 , 3 ,,"',   // notação científica, lista com espaços
    '5;faccaoLonga;2024-01-01 00:00:00;-23.55001;-46.63;true;"1"',     // facção longa, sem aspas no timestamp
    '',
    '6;;"2024-01-01 00:00:00";"-23.55";-46.63;false;',                 // número entre aspas
    '1;7;"2024-01-01 00:00:05";-23.55000;-46.63000;false;',
    '2;7;"2024-01-01 00:00:05";-23.55000;-46.63000;false;1;2',         // ";" a mais na lista de restrição
    '9;8;"2024-01-01 00:00:05";-0;0;false;',
    '9;8;"2024-01-01 00:00:05";-0.0;0.00000;false;'                    // sem quebra de linha no fim
  ].join('\r\n'), 'utf8');
  const casosEquivalencia: [string, string][] = [
    ...[1, 2, 3, 4, 5].map(n => [`Dataset ${n}`, arquivoDataset(n)] as [string, string]),
    ['dataset-com-falhas.txt', falhasPath],
    ['casos-limite de formatação', limites]
  ];
  for (const [nome, arquivo] of casosEquivalencia) {
    if (!fs.existsSync(arquivo)) { assert(false, `${nome}: arquivo não encontrado`); continue; }
    const rapido = new EncounterDetector(), ref = new EncounterDetector();
    const er = await rapido.processFile(arquivo);
    const ef = await ref.processFileReadline(arquivo);
    const mesmosEncontros = JSON.stringify(er) === JSON.stringify(ef);
    const mesmaAuditoria = JSON.stringify(rapido.lastRun) === JSON.stringify(ref.lastRun);
    assert(mesmosEncontros && mesmaAuditoria,
      `${nome}: mesmos encontros (${er.length}), falhas e funil` + (mesmosEncontros ? '' : ' [encontros diferentes]') + (mesmaAuditoria ? '' : ' [auditoria diferente]'));
  }
  fs.rmSync(limites, { force: true });

  const validacaoPath = ARQUIVO_VALIDACAO;
  fs.mkdirSync(path.dirname(validacaoPath), { recursive: true });
  fs.writeFileSync(
    validacaoPath,
    JSON.stringify({ executadoEm: new Date().toISOString(), passaram: passedTests, falharam: failedTests, datasets: validacao } satisfies Validacao, null, 2),
    'utf8'
  );
  console.log(`\nResultado da validação gravado em ${validacaoPath}`);

  console.log('\n======================================================');
  console.log(`TOTAL DE TESTES: ${passedTests + failedTests} | PASSARAM: ${passedTests} | FALHARAM: ${failedTests}`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

/**
 * Implementação de referência, propositalmente ingênua: split por linha e por ';',
 * todos os pares de cada timestamp, Haversine sem pré-filtro.
 */
function referenceDetect(content: string): Encounter[] {
  const byTs = new Map<string, MonitoredEntity[]>();
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('idMonitorado')) continue;
    const c = line.split(';');
    const e: MonitoredEntity = {
      id: Number(c[0]),
      faccao: c[1].replace(/"/g, '').trim(),
      timestamp: c[2].replace(/"/g, '').trim(),
      latitude: Number(c[3]),
      longitude: Number(c[4]),
      medidaProtetiva: c[5].trim().toLowerCase() === 'true',
      idsRestricaoMedida: (c[6] ?? '').replace(/"/g, '').split(',').filter(Boolean).map(Number)
    };
    const list = byTs.get(e.timestamp);
    if (list) list.push(e);
    else byTs.set(e.timestamp, [e]);
  }

  const out: Encounter[] = [];
  for (const [timestamp, list] of byTs) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude, DEFAULT_EARTH_RADIUS_METERS);
        if (!(d < 20)) continue;
        const tipo = classifyEncounter(a, b);
        if (!tipo) continue;
        out.push({
          tipo,
          monitoradosEncontro: [Math.min(a.id, b.id), Math.max(a.id, b.id)],
          timestamp,
          posicoes: {
            [a.id]: { lat: a.latitude, lon: a.longitude },
            [b.id]: { lat: b.latitude, lon: b.longitude }
          },
          distanciaMetros: d
        });
      }
    }
  }
  return out;
}

runTests().catch(err => {
  console.error('Erro nos testes:', err);
  process.exit(1);
});
