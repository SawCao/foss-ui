import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fileURLToPath } from 'url';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_DIR = path.join(__dirname, '../src/mock');

let nameToIdMap = new Map<string, string>();

type CliOptions = {
  targetClusters?: number;
  baseResolution: number;
};

function printUsageAndExit(code = 0): never {
  console.log(`
Usage:
  npx tsx scripts/generate-clusters.ts [options]

Options:
  -k, --clusters <number>    Target number of non-isolated clusters.
  -r, --resolution <number>  Louvain base resolution (default: 1).
  -h, --help                 Show this help.
`);
  process.exit(code);
}

function parsePositiveInteger(raw: string, flagName: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer, got "${raw}".`);
  }
  return value;
}

function parsePositiveNumber(raw: string, flagName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive number, got "${raw}".`);
  }
  return value;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = { baseResolution: 1 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printUsageAndExit(0);
    }

    if (arg === '-k' || arg === '--clusters') {
      const next = argv[i + 1];
      if (!next) throw new Error(`${arg} requires a value.`);
      options.targetClusters = parsePositiveInteger(next, arg);
      i += 1;
      continue;
    }

    if (arg.startsWith('--clusters=')) {
      options.targetClusters = parsePositiveInteger(arg.slice('--clusters='.length), '--clusters');
      continue;
    }

    if (arg === '-r' || arg === '--resolution') {
      const next = argv[i + 1];
      if (!next) throw new Error(`${arg} requires a value.`);
      options.baseResolution = parsePositiveNumber(next, arg);
      i += 1;
      continue;
    }

    if (arg.startsWith('--resolution=')) {
      options.baseResolution = parsePositiveNumber(arg.slice('--resolution='.length), '--resolution');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function mergeCommunitiesToTarget(
  graph: Graph,
  initialCommunities: Record<string, number>,
  targetClusters: number
): Record<string, number> {
  const adjustedCommunities: Record<string, number> = { ...initialCommunities };
  const groups = new Map<number, Set<string>>();

  Object.entries(adjustedCommunities).forEach(([nodeId, communityId]) => {
    if (!groups.has(communityId)) {
      groups.set(communityId, new Set<string>());
    }
    groups.get(communityId)!.add(nodeId);
  });

  while (groups.size > targetClusters) {
    const sortedBySize = Array.from(groups.entries()).sort((a, b) => a[1].size - b[1].size);
    const [fromId, fromNodes] = sortedBySize[0];

    const weightsToOthers = new Map<number, number>();
    graph.forEachEdge((_edge, attributes, source, target) => {
      const sourceCommunity = adjustedCommunities[source];
      const targetCommunity = adjustedCommunities[target];
      const weight = typeof attributes.weight === 'number' ? attributes.weight : 1;

      if (sourceCommunity === fromId && targetCommunity !== fromId) {
        weightsToOthers.set(targetCommunity, (weightsToOthers.get(targetCommunity) || 0) + weight);
      } else if (targetCommunity === fromId && sourceCommunity !== fromId) {
        weightsToOthers.set(sourceCommunity, (weightsToOthers.get(sourceCommunity) || 0) + weight);
      }
    });

    let toId: number | undefined;
    if (weightsToOthers.size > 0) {
      let bestWeight = -1;
      for (const [communityId, totalWeight] of weightsToOthers.entries()) {
        if (totalWeight > bestWeight) {
          bestWeight = totalWeight;
          toId = communityId;
        }
      }
    } else {
      const largest = Array.from(groups.entries())
        .filter(([communityId]) => communityId !== fromId)
        .sort((a, b) => b[1].size - a[1].size)[0];
      if (largest) {
        toId = largest[0];
      }
    }

    if (toId === undefined) {
      break;
    }

    for (const nodeId of fromNodes) {
      adjustedCommunities[nodeId] = toId;
      groups.get(toId)!.add(nodeId);
    }
    groups.delete(fromId);
  }

  return adjustedCommunities;
}

function detectCommunities(
  graph: Graph,
  baseResolution: number,
  targetClusters?: number
): Record<string, number> {
  const baseResult = louvain.detailed(graph, {
    getEdgeWeight: 'weight',
    resolution: baseResolution
  });

  if (!targetClusters) {
    return baseResult.communities;
  }

  if (baseResult.count === targetClusters) {
    return baseResult.communities;
  }

  let candidateAtOrAboveTarget: Record<string, number> | undefined;
  let currentResolution = baseResolution;
  let currentCount = baseResult.count;

  if (currentCount >= targetClusters) {
    candidateAtOrAboveTarget = baseResult.communities;
  }

  while (currentCount < targetClusters && currentResolution < 8192) {
    currentResolution *= 2;
    const result = louvain.detailed(graph, {
      getEdgeWeight: 'weight',
      resolution: currentResolution
    });
    currentCount = result.count;
    if (currentCount >= targetClusters) {
      candidateAtOrAboveTarget = result.communities;
      break;
    }
  }

  if (!candidateAtOrAboveTarget) {
    console.warn(
      `Could not reach ${targetClusters} clusters even at high resolution. Falling back to ${currentCount} clusters.`
    );
    return louvain(graph, { getEdgeWeight: 'weight', resolution: currentResolution });
  }

  const communityIds = new Set<number>(Object.values(candidateAtOrAboveTarget));
  if (communityIds.size === targetClusters) {
    return candidateAtOrAboveTarget;
  }

  return mergeCommunitiesToTarget(graph, candidateAtOrAboveTarget, targetClusters);
}

function getApiId(name: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return nameToIdMap.get(name) || `no-eim-${slug}`;
}

async function run() {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  if (cliOptions.targetClusters) {
    console.log(`Target non-isolated clusters: ${cliOptions.targetClusters}`);
  }
  console.log(`Louvain base resolution: ${cliOptions.baseResolution}`);

  console.log('Loading API flow data...');
  const preferredNames = ['api_flow.csv', 'api_flow_20k.csv', 'api_flow_l.csv'];
  let flowFile = '';
  for (const name of preferredNames) {
    const fPath = path.join(MOCK_DIR, name);
    if (fs.existsSync(fPath)) {
      flowFile = fPath;
      break;
    }
  }

  if (!flowFile) {
    console.error('No suitable api_flow*.csv found in src/mock');
    process.exit(1);
  }

  console.log(`Using flow data from: ${flowFile}`);
  const flowCsv = fs.readFileSync(flowFile, 'utf8');

  // Load API Scan data to get EIM numbers for ID mapping
  console.log('Loading API scan data for ID mapping...');
  const scanFiles = fs.readdirSync(MOCK_DIR)
    .filter(f => f.startsWith('api_scan_') && f.endsWith('.csv'))
    .sort((a, b) => b.localeCompare(a)); // Get latest

  if (scanFiles.length > 0) {
    const scanFile = path.join(MOCK_DIR, scanFiles[0]);
    console.log(`Using scan data from: ${scanFile}`);
    const scanCsv = fs.readFileSync(scanFile, 'utf8');
    const scanResults = Papa.parse(scanCsv, { header: true, skipEmptyLines: true });
    (scanResults.data as any[]).forEach(row => {
      const name = row['API name'] || row['PI name'];
      const eim = row['EIM No'] || 'no-eim';
      if (name) {
        const slug = name.toLowerCase().replace(/\s+/g, '-');
        nameToIdMap.set(name, `${eim}-${slug}`);
      }
    });
    console.log(`Mapped ${nameToIdMap.size} services from scan data.`);
  } else {
    console.warn('No api_scan_*.csv found. Using fallback IDs without EIM prefixes.');
  }
  
  Papa.parse(flowCsv, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const parsedFlowData = results.data as Record<string, string>[];
      const apiNames = new Set<string>();
      
      const flowLinks: { source: string; target: string; callFrequency: number }[] = [];
      
      parsedFlowData.forEach(row => {
        const sourceName = row['api'];
        if (!sourceName) return;
        
        apiNames.add(sourceName);
        let targets: string[] = [];
        try {
          const depsVal = (row['outboundDependencies'] || '[]').trim();
          if (depsVal.startsWith('[') && depsVal.endsWith(']')) {
            const content = depsVal.slice(1, -1).trim();
            if (content === '') {
              targets = [];
            } else {
              try {
                const parsed = JSON.parse(depsVal);
                targets = Array.isArray(parsed) ? parsed : [];
              } catch (e) {
                targets = content.split(',').map((s: string) => s.trim()).filter(Boolean);
              }
            }
          } else {
            targets = depsVal.split(';').map((s: string) => s.trim()).filter(Boolean);
          }
        } catch (e) {
          targets = [];
        }
        
        if (targets.length > 0) {
          const sourceId = getApiId(sourceName);
          targets.forEach(targetName => {
            apiNames.add(targetName);
            flowLinks.push({
              source: sourceId,
              target: getApiId(targetName),
              callFrequency: 1
            });
          });
        }
      });
      
      const nodeIds = Array.from(apiNames).map(name => getApiId(name));
      
      console.log(`Found ${nodeIds.length} unique nodes and ${flowLinks.length} edges.`);
      console.log('Detecting communities (Graphology Louvain)...');
      
      const graph = new Graph({ type: 'undirected', multi: false });
      
      nodeIds.forEach(nodeId => {
        if (!graph.hasNode(nodeId)) {
          graph.addNode(nodeId);
        }
      });
      
      flowLinks.forEach(link => {
        const weight = link.callFrequency || 1;
        if (graph.hasNode(link.source) && graph.hasNode(link.target)) {
          if (!graph.hasEdge(link.source, link.target)) {
            graph.addEdge(link.source, link.target, { weight });
          } else {
            const currentWeight = graph.getEdgeAttribute(link.source, link.target, 'weight');
            graph.setEdgeAttribute(link.source, link.target, 'weight', currentWeight + weight);
          }
        }
      });

      const communities = detectCommunities(
        graph,
        cliOptions.baseResolution,
        cliOptions.targetClusters
      );
      
      console.log('Calculating isolated nodes...');
      const nodeDegrees = new Map<string, number>();
      flowLinks.forEach(e => {
        const weight = e.callFrequency || 1;
        nodeDegrees.set(e.source, (nodeDegrees.get(e.source) || 0) + weight);
        nodeDegrees.set(e.target, (nodeDegrees.get(e.target) || 0) + weight);
      });
      
      const clusterMap: Record<string, string> = {};
      
      nodeIds.forEach(nodeId => {
        const isIsolated = (nodeDegrees.get(nodeId) || 0) === 0;
        if (isIsolated) {
          clusterMap[nodeId] = 'Unclustered';
        } else {
          clusterMap[nodeId] = `AI-Cluster-${communities[nodeId] || 0}`;
        }
      });

      const finalClusterCount = new Set(
        Object.values(clusterMap).filter(clusterName => clusterName !== 'Unclustered')
      ).size;
      console.log(`Final non-isolated clusters: ${finalClusterCount}`);
      
      const outFile = path.join(MOCK_DIR, 'api_clusters.json');
      fs.writeFileSync(outFile, JSON.stringify(clusterMap, null, 2));
      
      console.log(`Successfully generated AI clusters mapping -> ${outFile}`);
    }
  });
}

run().catch(console.error);
