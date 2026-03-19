import Papa from 'papaparse';

// We don't use ?raw here anymore so we can fetch them or import them dynamically
const scanFilesGlob = import.meta.glob('./api_scan_*.csv', { query: '?raw', import: 'default', eager: false });
const apiFlowGlob = import.meta.glob('./api_flow.csv', { query: '?raw', import: 'default', eager: false });

export type ScanStatus = 'success' | 'failed' | 'in_progress' | 'waiting';
export type ApiAction = 'A' | 'B' | 'C';

export interface ApiItem {
  id: string;
  name: string;
  platform: string;
  level3: string;
  level4: string;
  level5: string;
  action: ApiAction;
  repoUrl: string;
  branch: string;
  reportUrl: string;
  pluginReportUrl: string;
  scanStatus: ScanStatus;
  issueCount: number;
  rawDetails: Record<string, any>;
}

export interface AgentFixSummary {
  id: string;
  apiId: string;
  issueName: string;
  summary: string;
  date: string;
}

export interface Snapshot {
  id: string;
  date: string;
  data: ApiItem[];
}

export interface GraphNode {
  id: string;
  name: string;
  group: number;
  hasIssues: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  callFrequency: number;
}

/**
 * Async helper to parse CSV string using PapaParse Worker
 */
async function parseCSVAsync(csvString: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      worker: false, // Disabling worker for offline compatibility (file:// protocol issues)
      complete: (results) => {
        resolve(results.data as Record<string, string>[]);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

export function mapCsvRowToApiItem(row: Record<string, any>): ApiItem {
  if (!row) return {} as ApiItem; // Safety guard for malformed/empty rows
  const issueCount = parseInt(row['critical_count'] || '0', 10);
  
  let scanStatus: ScanStatus = 'success';
  if (String(row['status_is_error']) === 'true' || String(row['plugin_status_is_error']) === 'true') {
     scanStatus = 'failed';
  } else if (issueCount > 0) {
     scanStatus = 'failed';
  }
  
  const name = row['API name'] || row['PI name'] || 'Unknown API';
  
  return {
    id: row['EIM No'] || name.toLowerCase().replace(/\s+/g, '-'),
    name: name,
    platform: row['Platform'] || 'Unknown',
    level3: row['Level 3'] || 'Unknown',
    level4: row['Level 4'] || 'Unknown',
    level5: row['Level 5'] || 'Unknown',
    action: 'A',
    repoUrl: row['GitHub repo'] || '',
    branch: row['Branch'] || 'main',
    reportUrl: row['status_report_html_url'] || '',
    pluginReportUrl: row['plugin_status_report_html_url'] || '',
    scanStatus,
    issueCount: isNaN(issueCount) ? 0 : issueCount,
    rawDetails: row
  };
}

// Initial empty state
export let mockSnapshots: Snapshot[] = [];
export let mockApis: ApiItem[] = [];
export let mockFixSummaries: AgentFixSummary[] = [];
export let mockGraphData = { nodes: [] as GraphNode[], links: [] as GraphLink[] };

/**
 * Main initialization function to load and parse all data asynchronously
 */
export async function initializeMockData() {
  // 1. Load Flow Data
  const flowKeys = Object.keys(apiFlowGlob);
  let parsedFlowData: Record<string, string>[] = [];
  if (flowKeys.length > 0) {
    const apiFlowCsvRaw = await (apiFlowGlob[flowKeys[0]]() as Promise<string>);
    parsedFlowData = await parseCSVAsync(apiFlowCsvRaw);
  }

  // 2. Load and Parse Scan Files
  mockSnapshots = [];
  const scanEntries = Object.entries(scanFilesGlob);
  
  for (const [path, importFn] of scanEntries) {
    const match = path.match(/api_scan_(.*?)\.csv/);
    const dateStr = match ? match[1] : 'unknown';
    
    let formattedDate = dateStr;
    if (/^\d{8}$/.test(dateStr)) {
      formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }

    const content = await (importFn() as Promise<string>);
    const parsedData = await parseCSVAsync(content);
    
    const apiItems: ApiItem[] = parsedData
      .filter(row => row && (row['API name'] || row['PI name'] || row['EIM No'])) // Filter out junk rows
      .map(row => {
        const item = mapCsvRowToApiItem(row);
        const actionIndex = (item.name || '').length % 3;
        item.action = ['A', 'B', 'C'][actionIndex] as ApiAction;
        return item;
      });

    mockSnapshots.push({
      id: `snap-${dateStr}`,
      date: formattedDate,
      data: apiItems
    });
  }

  // Sort snapshots by date descending
  mockSnapshots.sort((a, b) => b.date.localeCompare(a.date));
  
  // Set latest apis
  mockApis = mockSnapshots.length > 0 ? mockSnapshots[0].data : [];

  // 3. Generate Mock Fix Summaries
  mockFixSummaries = mockApis.slice(0, 5).map((api, i) => ({
    id: `fix-${i + 1}`,
    apiId: api.id,
    issueName: `NullPointerException in ${api.name} handler`,
    summary: `Automated fix applied by Agent. Verified guards on payload.`,
    date: '2026-03-18'
  }));

  // 4. Build Graph Data
  const getApiId = (name: string) => {
    const found = mockApis.find(a => a.name === name);
    return found ? found.id : name.toLowerCase().replace(/\s+/g, '-');
  };

  const flowLinks: GraphLink[] = [];
  parsedFlowData.forEach(row => {
    const sourceName = row['api'];
    let targets: string[] = [];
    try {
      const depsVal = (row['outboundDependencies'] || '[]').trim();
      if (depsVal.startsWith('[') && depsVal.endsWith(']')) {
        const content = depsVal.slice(1, -1).trim();
        if (content === '') {
          targets = [];
        } else {
          // Attempt JSON parse first for backwards compatibility
          try {
            const parsed = JSON.parse(depsVal);
            targets = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            // Fallback for the new [api1,api2] format (not valid JSON if unquoted)
            targets = content.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }
      } else {
        // Fallback for old Format or semicolon-separated
        targets = depsVal.split(';').map((s: string) => s.trim()).filter(Boolean);
      }
    } catch (e) {
      targets = [];
    }
    
    if (sourceName && targets.length > 0) {
      const sourceId = getApiId(sourceName);
      targets.forEach(targetName => {
        flowLinks.push({
          source: sourceId,
          target: getApiId(targetName),
          value: 1,
          callFrequency: 1
        });
      });
    }
  });

  const graphNodeIds = new Set<string>();
  const graphNodes: GraphNode[] = [];

  mockApis.forEach(api => {
    graphNodeIds.add(api.id);
    graphNodes.push({
      id: api.id,
      name: api.name,
      group: api.action === 'A' ? 1 : api.action === 'B' ? 2 : 3,
      hasIssues: api.issueCount > 0
    });
  });

  flowLinks.forEach(link => {
    if (!graphNodeIds.has(link.target)) {
      graphNodeIds.add(link.target);
      graphNodes.push({
        id: link.target,
        name: link.target.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
        group: 4,
        hasIssues: false
      });
    }
  });

  mockGraphData = {
    nodes: graphNodes,
    links: flowLinks
  };

  return {
    apis: mockApis,
    snapshots: mockSnapshots,
    fixSummaries: mockFixSummaries,
    graphData: mockGraphData
  };
}
