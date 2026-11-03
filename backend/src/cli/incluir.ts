/**
 * Inclui um novo arquivo de dados com o nome original: confere o nome, se já existe, o
 * cabeçalho e se o conteúdo repete um dataset existente; grava na pasta de entradas, registra
 * no catálogo com o próximo número e já processa.
 *
 *   npm run incluir -- caminho/do/arquivo.txt
 *   npm run incluir -- caminho/temporario --nome "coleta março.txt"   (nome diferente do arquivo de origem)
 *   npm run incluir -- --verificar "coleta março.txt"                 (só confere se o nome pode ser usado)
 *
 * Opções: --mover (move em vez de copiar) e --json (última linha da saída em JSON, usada pelo BI).
 * Nada é sobrescrito: se já existir um arquivo com o mesmo nome, a inclusão é recusada.
 */
import fs from 'fs';
import path from 'path';
import type { CodigoErro, ErroBackend, ResultadoInclusao, VerificacaoArquivo } from '../../../shared/contrato';
import { conteudoDuplicado, PASTAS, registrarArquivo, relativo, validarCabecalho, verificarNome } from '../arquivos/datasets';
import { gravarExecucao, lerExecucao } from '../arquivos/metricas';
import { processarDataset, resumoFalhas } from '../processamento';

const args = process.argv.slice(2);
const json = args.includes('--json');
const mover = args.includes('--mover');

function valorDe(opcao: string): string | undefined {
  const i = args.indexOf(opcao);
  if (i >= 0) return args[i + 1];
  return args.find(a => a.startsWith(`${opcao}=`))?.slice(opcao.length + 1);
}
const verificar = valorDe('--verificar');
const nomePedido = valorDe('--nome');
const origem = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--nome' && args[i - 1] !== '--verificar');

function falhar(msg: string, codigo: CodigoErro = 'outro'): never {
  if (json) process.stdout.write(`${JSON.stringify({ erro: msg, codigo } satisfies ErroBackend)}\n`);
  else console.error(`[ERRO] ${msg}`);
  process.exit(1);
}

function mostrarVerificacao(v: VerificacaoArquivo): never {
  if (json) process.stdout.write(`${JSON.stringify(v)}\n`);
  else console.log(v.mensagem);
  process.exit(v.valido && !v.existe ? 0 : 1);
}

async function main(): Promise<void> {
  if (verificar !== undefined) mostrarVerificacao(verificarNome(verificar));

  if (!origem) falhar('Informe o arquivo: npm run incluir -- caminho/do/arquivo.txt');
  const caminho = path.resolve(origem);
  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) falhar(`Arquivo não encontrado: ${caminho}`);

  // 1. Nome: o mesmo do arquivo enviado, sem renomear. Se já existir, recusa.
  const v = verificarNome(nomePedido ?? path.basename(caminho));
  if (!v.valido) falhar(v.mensagem, 'nome_invalido');
  if (v.existe) falhar(`${v.mensagem} Renomeie o arquivo ou remova o existente antes de enviar.`, 'ja_existe');

  // 2. Formato e conteúdo
  const erro = validarCabecalho(caminho);
  if (erro) falhar(erro, 'cabecalho_invalido');
  const igual = await conteudoDuplicado(caminho);
  if (igual) {
    falhar(`O conteúdo é idêntico ao de "${igual.arquivo}" (dataset ${igual.n}), que já está no backend.`, 'conteudo_duplicado');
  }

  // 3. Grava com o nome original (wx: falha se alguém criou o arquivo nesse meio tempo)
  const destino = path.join(PASTAS.inputs, v.nome);
  fs.mkdirSync(PASTAS.inputs, { recursive: true });
  try {
    if (mover) {
      // Link + apagar a origem = mover sem copiar 600 MB e sem sobrescrever (link falha se o destino existe)
      try { fs.linkSync(caminho, destino); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw e;
        fs.copyFileSync(caminho, destino, fs.constants.COPYFILE_EXCL); // outro disco ou sem suporte a link
      }
      fs.rmSync(caminho, { force: true });
    } else {
      fs.copyFileSync(caminho, destino, fs.constants.COPYFILE_EXCL);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') falhar(`Já existe "${v.nome}" em ${relativo(PASTAS.inputs)}/.`, 'ja_existe');
    throw e;
  }
  const n = registrarArquivo(v.nome);
  if (!json) console.log(`Arquivo incluído como ${relativo(destino)} (dataset ${n}). Processando...`);

  const r = await processarDataset(n);
  const metricas = lerExecucao();
  metricas.set(n, r.metricas);
  gravarExecucao(metricas);

  const falhas = Object.values(r.metricas.falhas).reduce((s, f) => s + (f?.total ?? 0), 0);
  const resultado: ResultadoInclusao = {
    dataset: n, arquivo: relativo(destino), nome: v.nome, encontros: r.encontros.length, registros: r.metricas.records, falhas
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(resultado)}\n`);
  } else {
    console.log(`Dataset ${n} (${v.nome}): ${r.metricas.records} registros, ${r.encontros.length} encontros.`);
    const resumo = resumoFalhas(r.metricas);
    console.log(resumo ? `Falhas na coleta: ${resumo}.` : 'Nenhuma falha na coleta.');
    console.log('Abra o BI (npm run bi:serve) para ver os resultados.');
  }
}

main().catch(err => falhar(err instanceof Error ? err.message : String(err)));
