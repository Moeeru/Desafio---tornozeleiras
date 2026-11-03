/**
 * Gera frontend/dist/painel.html: um único arquivo com CSS, script e dados embutidos,
 * que abre direto no navegador (file://) ou pode ser enviado como anexo.
 *
 * Fonte do front: frontend/public/index.html + frontend/public/estilos.css + módulos de frontend/src/app compilados em frontend/dist/app/.
 * Para desenvolver com o servidor local e dados ao vivo, use `npm run bi:serve`.
 */
import fs from 'fs';
import path from 'path';
import { carregarDados } from './dados';
import { empacotarFront } from './empacotar';
import { RAIZ } from './raiz';
import type { DadosPainel } from '../../../shared/contrato';

export const ROOT = RAIZ;
export const FRONT_PUBLIC = path.join(ROOT, 'frontend', 'public');
export const FRONT_DIST = path.join(ROOT, 'frontend', 'dist', 'app');

/** Monta o HTML autocontido a partir do index.html do front. */
export function montarHtmlAutocontido(dados: DadosPainel): string {
  const shell = fs.readFileSync(path.join(FRONT_PUBLIC, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(FRONT_PUBLIC, 'estilos.css'), 'utf8');
  if (!fs.existsSync(path.join(FRONT_DIST, 'main.js'))) {
    throw new Error('frontend/dist/app/main.js não existe. Rode "npm run build:frontend" antes.');
  }
  const bundle = empacotarFront(FRONT_DIST);

  // "<" escapado para que nenhum texto dos dados ou do código feche a tag <script>
  const json = JSON.stringify(dados).replace(/</g, '\\u003c');
  const script = bundle.replace(/<\/script/gi, '<\\/script');

  const linkCss = /<link rel="stylesheet" href="\.\/estilos\.css" data-inline>/;
  const tagJs = /<script type="module" src="\.\/app\/main\.js" data-inline><\/script>/;
  if (!linkCss.test(shell) || !tagJs.test(shell)) {
    throw new Error('frontend/public/index.html precisa conter o <link> de estilos.css e o <script> de app/main.js marcados com data-inline.');
  }
  return shell
    .replace(linkCss, () => `<style>\n${css}</style>`)
    .replace(tagJs, () => `<script>window.__DADOS__ = ${json};</script>\n<script>\n${script}</script>`);
}

async function main(): Promise<void> {
  const dados = await carregarDados(ROOT, 'arquivo');
  dados.avisos.forEach(a => console.warn(`[AVISO] ${a}`));
  const outPath = path.join(ROOT, 'frontend', 'dist', 'painel.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, montarHtmlAutocontido(dados), 'utf8');

  const total = dados.datasets.reduce((s, d) => s + d.encontros.length, 0);
  console.log(`Painel gerado: ${outPath}`);
  console.log(`  ${dados.datasets.length} datasets, ${total} encontros, ${dados.execucao.length} registros de tempo, validação ${dados.validacao ? 'incluída' : 'ausente'}.`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERRO FATAL]:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
