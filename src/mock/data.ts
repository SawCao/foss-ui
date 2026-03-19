import apiFlowCsvRaw from './api_flow.csv?raw';

// Eagerly import all api_scan_*.csv files as raw strings
const scanFiles = import.meta.glob('./api_scan_*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

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

function parseCSV(csvString: string): Record<string, string>[] {
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Basic CSV split, assumes no commas inside values for this mock
    const values = line.split(',');
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i] ? values[i].trim() : '';
      return obj;
    }, {} as Record<string, string>);
  });
}

export function mapCsvRowToApiItem(row: Record<string, any>): ApiItem {
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

const parsedFlowData = parseCSV(apiFlowCsvRaw);

export const mockSnapshots: Snapshot[] = [];

Object.entries(scanFiles).forEach(([path, content]) => {
  const match = path.match(/api_scan_(.*?)\.csv/);
  const dateStr = match ? match[1] : 'unknown';
  
  let formattedDate = dateStr;
  if (/^\d{8}$/.test(dateStr)) {
    formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }

  const parsedData = parseCSV(content);
  const apiItems: ApiItem[] = parsedData.map(row => {
    const item = mapCsvRowToApiItem(row);
    const actionIndex = item.name.length % 3;
    item.action = ['A', 'B', 'C'][actionIndex] as ApiAction;
    return item;
  });

  mockSnapshots.push({
    id: `snap-${dateStr}`,
    date: formattedDate,
    data: apiItems
  });
});

// Sort snapshots by date descending
mockSnapshots.sort((a, b) => b.date.localeCompare(a.date));

// Default mockApis to the latest snapshot
export const mockApis: ApiItem[] = mockSnapshots.length > 0 ? mockSnapshots[0].data : [];

export const mockFixSummaries: AgentFixSummary[] = mockApis.slice(0, 5).map((api, i) => ({
  id: `fix-${i + 1}`,
  apiId: api.id,
  issueName: `NullPointerException in ${api.name} handler`,
  summary: `Automated fix applied by Agent. Verified guards on payload.`,
  date: '2026-03-18'
}));

const getApiId = (name: string) => {
  const found = mockApis.find(a => a.name === name);
  return found ? found.id : name.toLowerCase().replace(/\s+/g, '-');
};

const flowLinks: GraphLink[] = [];
parsedFlowData.forEach(row => {
  const sourceName = row['api'];
  const targets = (row['outboundDependencies'] || '').split(';').map(s => s.trim()).filter(Boolean);
  
  if (sourceName && targets.length > 0) {
    const sourceId = getApiId(sourceName);
    targets.forEach(targetName => {
      flowLinks.push({
        source: sourceId,
        target: getApiId(targetName),
        value: 1,
        callFrequency: 1 // Call volume forced to 1
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

export const mockGraphData = {
  nodes: graphNodes,
  links: flowLinks
};
