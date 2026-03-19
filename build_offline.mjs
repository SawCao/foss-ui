import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const dataFile = 'src/mock/data.ts';
const htmlFile = 'index.html';

const origData = fs.readFileSync(dataFile, 'utf-8');
const origHtml = fs.readFileSync(htmlFile, 'utf-8');

const targetStr = `import apiFlowCsvRaw from './api_flow.csv?raw';

// Eagerly import all api_scan_*.csv files as raw strings
const scanFiles = import.meta.glob('./api_scan_*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;`;

const replacementStr = `let apiFlowCsvRaw: string = '';
let scanFiles: Record<string, string> = {};

if (typeof window !== 'undefined' && 'MOCK_FILES' in window) {
  const MOCK = (window as any).MOCK_FILES;
  // Values are JSON-encoded strings (produced by PowerShell ConvertTo-Json), so we parse them.
  const decode = (v: any) => (typeof v === 'string' && v.startsWith('"')) ? JSON.parse(v) : String(v ?? '');
  apiFlowCsvRaw = decode(MOCK['api_flow.csv']);
  scanFiles = Object.fromEntries(
    Object.entries(MOCK)
      .filter(([k]) => k.startsWith('api_scan_') && k.endsWith('.csv'))
      .map(([k, v]) => [k, decode(v)])
  ) as Record<string, string>;
} else {
  // @ts-ignore
  apiFlowCsvRaw = import.meta.glob('./api_flow.csv', { query: '?raw', import: 'default', eager: true })['./api_flow.csv'] as string;
  // @ts-ignore
  scanFiles = import.meta.glob('./api_scan_*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
}
`;

try {
  // Only patch data.ts before build
  console.log('Patching files for offline build...');
  fs.writeFileSync(dataFile, origData.replace(targetStr, replacementStr));

  console.log('Running Vite build...');
  execSync('npm run build', { stdio: 'inherit', shell: true });

  // Patch dist/index.html after build
  const distHtmlFile = 'dist/index.html';
  if (fs.existsSync(distHtmlFile)) {
    const distHtml = fs.readFileSync(distHtmlFile, 'utf-8');
    // Inject BEFORE the first <script so mock data is available when the module runs
    const newDistHtml = distHtml.replace('<script ', '  <script src="./mock/mock_data.js"></script>\n    <script ');
    fs.writeFileSync(distHtmlFile, newDistHtml);
  }

  console.log('Creating release package...');
  if (!fs.existsSync('release')) {
    fs.mkdirSync('release/mock', { recursive: true });
  } else if (!fs.existsSync('release/mock')) {
    fs.mkdirSync('release/mock', { recursive: true });
  }

  execSync('xcopy dist release /E /I /Q /Y', { stdio: 'inherit', shell: true });
  
  const mockFiles = fs.readdirSync('src/mock').filter(f => f.endsWith('.csv'));
  for (const file of mockFiles) {
    fs.copyFileSync(path.join('src/mock', file), path.join('release/mock', file));
  }
  
  fs.copyFileSync('release_tools/双击更新数据并打开.cmd', 'release/mock/双击更新数据并打开.cmd');
  fs.copyFileSync('release_tools/generate_mock.ps1', 'release/mock/generate_mock.ps1');

  console.log('\n[SUCCESS] Release package created in ./release directory!');

} catch (e) {
  console.error('[ERROR]', e);
} finally {
  console.log('Restoring original files (No code override guarantee!)...');
  fs.writeFileSync(dataFile, origData);
}
