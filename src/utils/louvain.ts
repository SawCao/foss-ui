export interface Edge {
  source: string;
  target: string;
  weight: number;
}

/**
 * A lightweight, fast, weighted Label Propagation / Modularity Optimization algorithm
 * inspired by the Louvain method to detect communities in a graph.
 */
export function detectCommunities(nodes: string[], edges: Edge[]): Record<string, number> {
  const m2 = edges.reduce((acc, e) => acc + e.weight, 0) * 2 || 1;
  const communities: Record<string, number> = {};
  const degrees: Record<string, number> = {};
  const graph: Record<string, Record<string, number>> = {};

  // Initialize
  nodes.forEach((n, i) => {
    communities[n] = i;
    degrees[n] = 0;
    graph[n] = {};
  });

  // Build Adjacency Dictionary
  edges.forEach(e => {
    if (!graph[e.source] || !graph[e.target]) return; // safeguard
    graph[e.source][e.target] = (graph[e.source][e.target] || 0) + e.weight;
    graph[e.target][e.source] = (graph[e.target][e.source] || 0) + e.weight;
    degrees[e.source] += e.weight;
    degrees[e.target] += e.weight;
  });

  let changed = true;
  let maxPasses = 15;
  
  // Phase 1: Local moving to maximize modularity
  while (changed && maxPasses > 0) {
    changed = false;
    maxPasses--;
    
    // Pseudo-random resolution order
    const shuffledNodes = [...nodes].sort(() => Math.random() - 0.5);

    // Optimize sum_tot calculation by maintaining community sums
      const communityDegrees: Record<number, number> = {};
      nodes.forEach(n => {
        const com = communities[n];
        communityDegrees[com] = (communityDegrees[com] || 0) + degrees[n];
      });

      for (const node of shuffledNodes) {
        const currentCom = communities[node];
        const neighbors = graph[node];
        if (!neighbors) continue;

        const comWeights: Record<number, number> = {};
        for (const neighbor in neighbors) {
          if (neighbor === node) continue;
          const nCom = communities[neighbor];
          comWeights[nCom] = (comWeights[nCom] || 0) + neighbors[neighbor];
        }

        let bestCom = currentCom;
        let maxModularityGain = 0;
        const k_i = degrees[node];

        // Evaluate Q gain for all neighbor communities
        for (const comStr in comWeights) {
          const com = parseInt(comStr);
          if (com === currentCom) continue;

          // Optimized: use pre-calculated community surface
          const sum_tot = communityDegrees[com] || 0;
          const k_i_in = comWeights[com];
          
          // Simplified modularity gain formula: ΔQ = [ (Σin + 2ki,in)/2m - ((Σtot + ki)/2m)^2 ] - [ Σin/2m - (Σtot/2m)^2 - (ki/2m)^2 ]
          // Which simplifies for a single node moving to: gain = ki,in - (ki * Σtot) / m
          const gain = k_i_in - (k_i * sum_tot) / m2;

          if (gain > maxModularityGain) {
            maxModularityGain = gain;
            bestCom = com;
          }
        }

        if (bestCom !== currentCom && maxModularityGain > 0) {
          // Update community degrees mapping
          communityDegrees[currentCom] -= k_i;
          communityDegrees[bestCom] = (communityDegrees[bestCom] || 0) + k_i;
          
          communities[node] = bestCom;
          changed = true;
        }
      }
  }
  
  // Re-index clusters to consecutive IDs
  const uniqueComs = Array.from(new Set(Object.values(communities)));
  const normalized: Record<string, number> = {};
  nodes.forEach(n => {
    normalized[n] = uniqueComs.indexOf(communities[n]) + 1;
  });
  
  return normalized;
}
