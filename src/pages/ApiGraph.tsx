import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Box, Typography, Card, CardContent, Tabs, Tab, IconButton, Divider, Button, Chip, CircularProgress } from '@mui/material';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import CloseIcon from '@mui/icons-material/Close';
import CircleIcon from '@mui/icons-material/Circle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { detectCommunities } from '../utils/louvain';
import { forceCollide, forceRadial } from 'd3-force';

const GLOBAL_COLLISION_PADDING = 14;
const EXPANDED_CLUSTER_PADDING = 28;
const EXPANDED_CLUSTER_EXCLUSION_PADDING = 34;
const EXPANDED_CLUSTER_PULL_STRENGTH = 0.22;
const EXPANDED_CLUSTER_BOUNDARY_STRENGTH = 0.35;
const EXPANDED_CLUSTER_EXCLUSION_STRENGTH = 0.42;
const LARGE_GRAPH_NODE_THRESHOLD = 180;
const LARGE_GRAPH_LINK_THRESHOLD = 320;
const VERY_LARGE_GRAPH_NODE_THRESHOLD = 320;
const VERY_LARGE_GRAPH_LINK_THRESHOLD = 700;
const UNCLUSTERED_GROUP_ID = 'Unclustered';

type DisplayNode = {
  id: string;
  name: string;
  hasIssues: boolean;
  size: number;
  val: number;
  degree?: number;
  connectionCount?: number;
  apisInside?: string[];
  originalGroupId?: string;
  originalGroupName?: string;
  isClusterNode?: boolean;
  isExpandedMember?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

type ClusterAnchor = {
  x: number;
  y: number;
};

type ExpandedClusterLayout = {
  groupId: string;
  memberIds: Set<string>;
  slots: Map<string, { x: number; y: number }>;
  radius: number;
};

type ClusterListItem = {
  id: string;
  name: string;
  hasIssues: boolean;
  level4?: string;
  level5?: string;
};

const getNodeRadius = (node: Partial<DisplayNode> | null | undefined) => Math.max(6, node?.val || 6);

const getOrbitRadius = (node: Partial<DisplayNode>, maxDegree: number) => {
  const invertedScore = 1 - ((node.degree || 0) / maxDegree);

  if (invertedScore < 0.15) return 0;
  if (invertedScore < 0.4) return 90;
  if (invertedScore < 0.7) return 190;
  return 300;
};

const formatClusterName = (groupId: string) => (
  groupId === UNCLUSTERED_GROUP_ID
    ? UNCLUSTERED_GROUP_ID
    : groupId.replace(/^AI-Cluster-/, 'AI Cluster ')
);

const getAutoClusterGroupId = (
  nodeId: string,
  communities: Record<string, number>,
  isolatedNodeIds: Set<string>
) => {
  if (isolatedNodeIds.has(nodeId)) {
    return UNCLUSTERED_GROUP_ID;
  }

  return `AI-Cluster-${communities[nodeId] || 0}`;
};

const buildExpandedClusterLayout = (nodes: DisplayNode[]): ExpandedClusterLayout | null => {
  if (nodes.length === 0) return null;

  const orderedNodes = [...nodes].sort((a, b) => {
    const degreeDiff = (b.degree || 0) - (a.degree || 0);
    if (degreeDiff !== 0) return degreeDiff;
    return String(a.id).localeCompare(String(b.id));
  });

  const maxNodeRadius = orderedNodes.reduce((max, node) => Math.max(max, getNodeRadius(node)), 0);
  const slotGap = Math.max(44, maxNodeRadius * 2 + 14);
  const slots = new Map<string, { x: number; y: number }>();

  let cursor = 0;
  let ringIndex = 0;
  let furthestExtent = 0;

  while (cursor < orderedNodes.length) {
    const ringRadius = ringIndex === 0 ? 0 : ringIndex * slotGap;
    const capacity = ringIndex === 0
      ? 1
      : Math.max(6, Math.floor((2 * Math.PI * ringRadius) / slotGap));

    for (let i = 0; i < capacity && cursor < orderedNodes.length; i += 1) {
      const node = orderedNodes[cursor];
      const angle = ringIndex === 0
        ? 0
        : ((i / capacity) * Math.PI * 2) + (ringIndex % 2 ? Math.PI / capacity : 0);

      const x = Math.cos(angle) * ringRadius;
      const y = Math.sin(angle) * ringRadius;

      slots.set(node.id, { x, y });
      furthestExtent = Math.max(furthestExtent, ringRadius + getNodeRadius(node));
      cursor += 1;
    }

    ringIndex += 1;
  }

  return {
    groupId: String(nodes[0].originalGroupId),
    memberIds: new Set(nodes.map(node => node.id)),
    slots,
    radius: Math.max(96, furthestExtent + EXPANDED_CLUSTER_PADDING)
  };
};

const createExpandedClusterForce = (
  layouts: ExpandedClusterLayout[],
  clusterAnchorsRef: { current: Map<string, ClusterAnchor> }
) => {
  let nodes: DisplayNode[] = [];

  const force = (alpha: number) => {
    if (layouts.length === 0) return;

    const resolvedLayouts = layouts
      .map(layout => {
        const anchor = clusterAnchorsRef.current.get(layout.groupId);
        return anchor ? { ...layout, anchor } : null;
      })
      .filter(Boolean) as Array<ExpandedClusterLayout & { anchor: ClusterAnchor }>;

    if (resolvedLayouts.length === 0) return;

    const nodesById = new Map(nodes.map(node => [String(node.id), node]));

    resolvedLayouts.forEach(layout => {
      layout.memberIds.forEach(memberId => {
        const node = nodesById.get(memberId);
        const slot = layout.slots.get(memberId);

        if (!node || !slot) return;

        const targetX = layout.anchor.x + slot.x;
        const targetY = layout.anchor.y + slot.y;
        const nodeX = node.x ?? layout.anchor.x;
        const nodeY = node.y ?? layout.anchor.y;

        node.vx = (node.vx || 0) + (targetX - nodeX) * EXPANDED_CLUSTER_PULL_STRENGTH * alpha;
        node.vy = (node.vy || 0) + (targetY - nodeY) * EXPANDED_CLUSTER_PULL_STRENGTH * alpha;

        const dx = nodeX - layout.anchor.x;
        const dy = nodeY - layout.anchor.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const maxDistance = Math.max(18, layout.radius - getNodeRadius(node) - 8);

        if (distance > maxDistance) {
          const correction = (distance - maxDistance) * EXPANDED_CLUSTER_BOUNDARY_STRENGTH * alpha;
          node.vx -= (dx / distance) * correction;
          node.vy -= (dy / distance) * correction;
        }
      });
    });

    nodes.forEach(node => {
      resolvedLayouts.forEach(layout => {
        if (node.isExpandedMember && node.originalGroupId === layout.groupId) return;

        const nodeX = node.x ?? layout.anchor.x;
        const nodeY = node.y ?? layout.anchor.y;
        const dx = nodeX - layout.anchor.x;
        const dy = nodeY - layout.anchor.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const minDistance = layout.radius + getNodeRadius(node) + EXPANDED_CLUSTER_EXCLUSION_PADDING;

        if (distance < minDistance) {
          const correction = (minDistance - distance) * EXPANDED_CLUSTER_EXCLUSION_STRENGTH * alpha;
          node.vx = (node.vx || 0) + (dx / distance) * correction;
          node.vy = (node.vy || 0) + (dy / distance) * correction;
        }
      });
    });
  };

  force.initialize = (incomingNodes: DisplayNode[]) => {
    nodes = incomingNodes || [];
  };

  return force;
};

export default function ApiGraph() {
  const { graphData, apis, isLoading } = useStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const clusterAnchorsRef = useRef<Map<string, ClusterAnchor>>(new Map());
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [groupBy, setGroupBy] = useState<'none' | 'autoCluster' | 'level4' | 'level5'>('none');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [focusedAutoClusterId, setFocusedAutoClusterId] = useState<string | null>(null);
  const [showAllDeps, setShowAllDeps] = useState(false);

  useEffect(() => {
    setShowAllDeps(false);
  }, [selectedNode]);

  if (isLoading && apis.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 2 }}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">Loading complex topology...</Typography>
      </Box>
    );
  }

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setSelectedNode(null);
    setExpandedGroups(new Set());
    setFocusedAutoClusterId(null);
  }, [groupBy]);

  const apiById = useMemo(() => new Map(apis.map(api => [api.id, api])), [apis]);

  const graphNodeById = useMemo(
    () => new Map(graphData.nodes.map(node => [String(node.id), node])),
    [graphData.nodes]
  );

  const autoClusterData = useMemo(() => {
    if (groupBy !== 'autoCluster') {
      return {
        communities: {} as Record<string, number>,
        isolatedNodeIds: new Set<string>(),
        clusterApiIds: new Map<string, string[]>(),
        clusterMemberIds: new Map<string, string[]>()
      };
    }

    const getLinkId = (nodeRef: any) => typeof nodeRef === 'object' ? nodeRef.id : nodeRef;
    const nodesStrings = graphData.nodes.map(n => String(n.id));
    const nodeDegrees = new Map<string, number>(nodesStrings.map(nodeId => [nodeId, 0]));
    const edgesData = graphData.links.map((l: any) => ({
      source: String(getLinkId(l.source)),
      target: String(getLinkId(l.target)),
      weight: l.callFrequency || 1
    }));

    edgesData.forEach(edge => {
      const weight = Math.max(1, edge.weight || 1);
      nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + weight);
      nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + weight);
    });

    const isolatedNodeIds = new Set(
      nodesStrings.filter(nodeId => (nodeDegrees.get(nodeId) || 0) === 0)
    );

    const communities = detectCommunities(nodesStrings, edgesData);
    const clusterApiIds = new Map<string, string[]>();
    const clusterMemberIds = new Map<string, string[]>();

    graphData.nodes.forEach(node => {
      const nodeId = String(node.id);
      const groupId = getAutoClusterGroupId(nodeId, communities, isolatedNodeIds);

      if (!clusterMemberIds.has(groupId)) {
        clusterMemberIds.set(groupId, []);
      }
      clusterMemberIds.get(groupId)?.push(nodeId);

      if (apiById.has(nodeId)) {
        if (!clusterApiIds.has(groupId)) {
          clusterApiIds.set(groupId, []);
        }
        clusterApiIds.get(groupId)?.push(nodeId);
      } else if (!clusterApiIds.has(groupId)) {
        clusterApiIds.set(groupId, []);
      }
    });

    clusterApiIds.forEach(apiIds => {
      apiIds.sort((leftId, rightId) => {
        const leftName = apiById.get(leftId)?.name || leftId;
        const rightName = apiById.get(rightId)?.name || rightId;
        return leftName.localeCompare(rightName);
      });
    });

    return { communities, isolatedNodeIds, clusterApiIds, clusterMemberIds };
  }, [groupBy, graphData, apiById]);

  useEffect(() => {
    if (
      groupBy === 'autoCluster'
      && focusedAutoClusterId
      && !autoClusterData.clusterMemberIds.has(focusedAutoClusterId)
    ) {
      setFocusedAutoClusterId(null);
      setSelectedNode(null);
    }
  }, [groupBy, focusedAutoClusterId, autoClusterData]);

  const displayGraphData = useMemo(() => {
    const getLinkId = (nodeRef: any) => typeof nodeRef === 'object' ? nodeRef.id : nodeRef;

    if (groupBy === 'autoCluster' && focusedAutoClusterId) {
      const clusterApiIds = autoClusterData.clusterApiIds.get(focusedAutoClusterId) || [];
      const includedIds = new Set(clusterApiIds);
      const subgraphNodes = new Map<string, DisplayNode>();
      const subgraphLinks = new Map<string, { source: string; target: string; value: number; callFrequency: number }>();

      graphData.nodes.forEach(node => {
        const nodeId = String(node.id);
        if (!includedIds.has(nodeId)) return;

        subgraphNodes.set(nodeId, {
          id: nodeId,
          name: node.name,
          hasIssues: node.hasIssues,
          size: 1,
          val: 6,
          degree: 0,
          connectionCount: 0,
          isClusterNode: false,
          isExpandedMember: false
        });
      });

      graphData.links.forEach((link: any) => {
        const sourceId = String(getLinkId(link.source));
        const targetId = String(getLinkId(link.target));

        if (!includedIds.has(sourceId) || !includedIds.has(targetId) || sourceId === targetId) return;

        const linkKey = `${sourceId}->${targetId}`;
        if (!subgraphLinks.has(linkKey)) {
          subgraphLinks.set(linkKey, { source: sourceId, target: targetId, value: 0, callFrequency: 0 });
        }

        const nextLink = subgraphLinks.get(linkKey);
        if (!nextLink) return;
        nextLink.value += 1;
        nextLink.callFrequency += (link.callFrequency || 1);
      });

      const finalNodes = Array.from(subgraphNodes.values());
      const finalLinks = Array.from(subgraphLinks.values());

      finalLinks.forEach(link => {
        const sourceNode = subgraphNodes.get(link.source);
        const targetNode = subgraphNodes.get(link.target);

        if (sourceNode) {
          sourceNode.degree = (sourceNode.degree || 0) + Math.max(1, link.callFrequency || 1);
          sourceNode.connectionCount = (sourceNode.connectionCount || 0) + 1;
        }
        if (targetNode) {
          targetNode.degree = (targetNode.degree || 0) + Math.max(1, link.callFrequency || 1);
          targetNode.connectionCount = (targetNode.connectionCount || 0) + 1;
        }
      });

      finalNodes.forEach(node => {
        node.val = Math.max(7, Math.min(30, 6 + (node.connectionCount || 0) * 2.5));
      });

      return {
        nodes: finalNodes,
        links: finalLinks
      };
    }

    const communities = groupBy === 'autoCluster' ? autoClusterData.communities : {};
    const isolatedNodeIds = groupBy === 'autoCluster' ? autoClusterData.isolatedNodeIds : new Set<string>();

    const newNodes = new Map();
    const newLinks = new Map();
    const nodeIdToGroup = new Map();

    graphData.nodes.forEach(node => {
      const api = apiById.get(String(node.id));
      let groupId = String(node.id);
      let groupName = node.name;
      let targetGroupId = '';
      let targetGroupName = '';
      
      if (groupBy === 'autoCluster') {
        targetGroupId = getAutoClusterGroupId(String(node.id), communities, isolatedNodeIds);
        targetGroupName = formatClusterName(targetGroupId);
      } else if (api && (groupBy === 'level4' || groupBy === 'level5')) {
        targetGroupId = String(api[groupBy as 'level4' | 'level5']) || 'Unknown';
        targetGroupName = `${groupBy.toUpperCase()}: ${targetGroupId}`;
      } else {
        targetGroupId = `Infrastructure: ${node.name}`;
        targetGroupName = node.name;
      }

      const isExpandedMember = groupBy !== 'none' && groupBy !== 'autoCluster' && expandedGroups.has(targetGroupId);
      
      if (groupBy !== 'none') {
        if (isExpandedMember) {
          // Flatten back to individual api node because the parent cluster is expanded
          groupId = String(node.id);
          groupName = node.name;
        } else {
          // Wrapped as clustered group
          groupId = targetGroupId;
          groupName = targetGroupName;
        }
      }

      nodeIdToGroup.set(node.id, groupId);

      if (!newNodes.has(groupId)) {
        newNodes.set(groupId, {
          id: groupId,
          name: groupName,
          hasIssues: false,
          size: 0,
          apisInside: groupId === targetGroupId && groupBy !== 'none' ? [] : undefined,
          val: groupId === targetGroupId && groupBy !== 'none' ? 0 : 6,
          originalGroupId: targetGroupId, // link to parent for collapsing
          originalGroupName: targetGroupName,
          isClusterNode: groupId === targetGroupId && groupBy !== 'none',
          isExpandedMember: isExpandedMember && groupId !== targetGroupId
        });
      }
      
      const g = newNodes.get(groupId);
      if (groupId === targetGroupId && groupBy !== 'none') {
        g.size += 1;
        g.val = g.size * 2 + 5;
        if (api) g.apisInside.push(api.id);
      }
      if (node.hasIssues) {
        g.hasIssues = true;
      }
    });

    graphData.links.forEach((link: any) => {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);
      const sourceGrp = nodeIdToGroup.get(sourceId);
      const targetGrp = nodeIdToGroup.get(targetId);

      if (sourceGrp && targetGrp && sourceGrp !== targetGrp) {
        const linkKey = `${sourceGrp}->${targetGrp}`;
        if (!newLinks.has(linkKey)) {
          newLinks.set(linkKey, { source: sourceGrp, target: targetGrp, value: 0, callFrequency: 0 });
        }
        const lnk = newLinks.get(linkKey);
        lnk.value += 1;
        lnk.callFrequency += (link.callFrequency || 1);
      }
    });

    const finalNodes = Array.from(newNodes.values());
    const finalLinks = Array.from(newLinks.values());

    finalNodes.forEach((n: any) => { n.degree = 0; n.connectionCount = 0; });
    finalLinks.forEach((l: any) => {
      const srcNode = newNodes.get(l.source);
      const tgtNode = newNodes.get(l.target);
      if (srcNode) {
        srcNode.degree += Math.max(1, l.callFrequency || 1);
        srcNode.connectionCount += 1;
      }
      if (tgtNode) {
        tgtNode.degree += Math.max(1, l.callFrequency || 1);
        tgtNode.connectionCount += 1;
      }
    });

    finalNodes.forEach((n: any) => {
      if (!n.apisInside) {
        n.val = Math.max(5, Math.min(28, 4 + n.connectionCount * 2.5));
      }
    });

    return {
      nodes: finalNodes,
      links: finalLinks
    };
  }, [graphData, apiById, groupBy, expandedGroups, focusedAutoClusterId, autoClusterData]);

  const expandedClusterLayouts = useMemo(() => {
    const groups = new Map<string, DisplayNode[]>();

    displayGraphData.nodes.forEach((node: DisplayNode) => {
      if (!node.isExpandedMember || !node.originalGroupId) return;

      if (!groups.has(node.originalGroupId)) {
        groups.set(node.originalGroupId, []);
      }
      groups.get(node.originalGroupId)?.push(node);
    });

    return new Map(
      Array.from(groups.entries())
        .map(([groupId, nodes]) => {
          const layout = buildExpandedClusterLayout(nodes);
          return layout ? [groupId, layout] : null;
        })
        .filter(Boolean) as Array<[string, ExpandedClusterLayout]>
    );
  }, [displayGraphData]);

  const performanceMode = useMemo(() => {
    const nodeCount = displayGraphData.nodes.length;
    const linkCount = displayGraphData.links.length;
    const isLargeGraph = nodeCount >= LARGE_GRAPH_NODE_THRESHOLD || linkCount >= LARGE_GRAPH_LINK_THRESHOLD;
    const isVeryLargeGraph = nodeCount >= VERY_LARGE_GRAPH_NODE_THRESHOLD || linkCount >= VERY_LARGE_GRAPH_LINK_THRESHOLD;

    return {
      isLargeGraph,
      isVeryLargeGraph,
      collisionIterations: isVeryLargeGraph ? 3 : isLargeGraph ? 4 : 5,
      alphaDecay: isVeryLargeGraph ? 0.09 : isLargeGraph ? 0.07 : 0.045,
      velocityDecay: isVeryLargeGraph ? 0.4 : isLargeGraph ? 0.34 : 0.28,
      cooldownTicks: isVeryLargeGraph ? 70 : isLargeGraph ? 95 : 140
    };
  }, [displayGraphData]);

  const focusGraphNode = useCallback((node: any, zoomLevel = 2) => {
    if (!node) return;

    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 800);
      fgRef.current.zoom(zoomLevel, 800);
    }
  }, []);

  const resetFocusedAutoClusterView = useCallback(() => {
    setFocusedAutoClusterId(null);
    setSelectedNode(null);
  }, []);

  const rememberNodePositions = useCallback(() => {
    displayGraphData.nodes.forEach((node: DisplayNode) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

      nodePositionsRef.current.set(node.id, { x: node.x as number, y: node.y as number });

      if (node.isClusterNode) {
        clusterAnchorsRef.current.set(node.id, { x: node.x as number, y: node.y as number });
      }
    });
  }, [displayGraphData]);

  useEffect(() => {
    displayGraphData.nodes.forEach((node: DisplayNode) => {
      if (node.isExpandedMember && node.originalGroupId) {
        const anchor = clusterAnchorsRef.current.get(node.originalGroupId);
        const layout = expandedClusterLayouts.get(node.originalGroupId);
        const slot = layout?.slots.get(node.id);

        if (anchor && slot) {
          node.x = anchor.x + slot.x;
          node.y = anchor.y + slot.y;
          node.vx = 0;
          node.vy = 0;
          return;
        }
      }

      if (node.isClusterNode) {
        const anchor = clusterAnchorsRef.current.get(node.id);
        if (anchor) {
          node.x = anchor.x;
          node.y = anchor.y;
          node.vx = 0;
          node.vy = 0;
          return;
        }
      }

      const previousPosition = nodePositionsRef.current.get(node.id);
      if (previousPosition) {
        node.x = previousPosition.x;
        node.y = previousPosition.y;
        node.vx = 0;
        node.vy = 0;
      }
    });
  }, [displayGraphData, expandedClusterLayouts]);

  useEffect(() => {
    if (!fgRef.current || displayGraphData.nodes.length === 0) return;

    const zoomTimer = window.setTimeout(() => {
      fgRef.current?.zoomToFit(800, 80);
    }, 120);

    return () => window.clearTimeout(zoomTimer);
  }, [groupBy, focusedAutoClusterId, displayGraphData.nodes.length]);

  useEffect(() => {
    if (fgRef.current) {
      const maxDegree = Math.max(1, ...displayGraphData.nodes.map((n: any) => n.degree || 0));

      fgRef.current.d3Force('link').distance((link: any) => {
        const freq = link.callFrequency || 1;
        // Tighter link constraints limit maximum explosion distance
        return Math.max(20, Math.min(100, 100000 / (freq + 1000))); 
      });

      // Stronger collision margin keeps circles separated even under dense cluster expansion.
      fgRef.current.d3Force(
        'collide',
        forceCollide((node: DisplayNode) => getNodeRadius(node) + GLOBAL_COLLISION_PADDING)
          .iterations(performanceMode.collisionIterations)
      );

      // Discrete concentric orbit physics for non-expanded nodes.
      fgRef.current.d3Force('radial', forceRadial(
        (node: DisplayNode) => node.isExpandedMember ? Math.hypot(node.x || 0, node.y || 0) : getOrbitRadius(node, maxDegree),
        0, 0
      ).strength((node: DisplayNode) => node.isExpandedMember ? 0 : 1.35));

      fgRef.current.d3Force(
        'expandedCluster',
        createExpandedClusterForce(Array.from(expandedClusterLayouts.values()), clusterAnchorsRef)
      );

      // Slightly stronger repulsion leaves more room for opened cluster boundaries.
      fgRef.current.d3Force('charge').strength(-40);

      fgRef.current.d3ReheatSimulation();
    }
  }, [displayGraphData, groupBy, expandedClusterLayouts, performanceMode]);

  const handleNodeClick = useCallback((node: any) => {
    focusGraphNode(node);
  }, [focusGraphNode]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const isError = node.hasIssues;
    const isAggregated = node.apisInside !== undefined;
    const isSelected = selectedNode && selectedNode.id === node.id;
    const size = node.val;

    const bgColor = isError ? '#fee2e2' : (isAggregated ? '#e0e7ff' : '#dcfce7');
    const strokeColor = isError ? '#ef4444' : (isAggregated ? '#6366f1' : '#10b981');

    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
    ctx.fillStyle = bgColor;
    ctx.fill();
    
    ctx.lineWidth = isSelected ? 3 : (isAggregated ? 2 : 1.5);
    ctx.strokeStyle = isSelected ? '#3b82f6' : strokeColor;
    ctx.stroke();

    // Pulse error effect
    if (isError) {
      const t = performance.now();
      const pulse = (Math.sin(t / 150) + 1) / 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 1 + pulse * 2, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 - pulse * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 6, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(59, 130, 246, 0.6)`;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isSelected || (globalScale > 2 && !isAggregated)) {
      // If we want to strictly follow "don't show", we should only show on selection.
      // But usually some context is needed on high zoom. 
      // Let's stick to "Only show on selection" to be safe with the user request.
      if (isSelected) {
        const fontSize = 14 / globalScale;
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(label, node.x, node.y + size + fontSize + 2);
      }
    }
    
    if (isAggregated && globalScale > 1.5) {
      const fontSize = 12 / globalScale;
      ctx.font = `600 ${fontSize * 0.75}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isError ? '#ef4444' : '#64748b';
      ctx.fillText(`[ ${node.size} Elements ]`, node.x, node.y + size + (isSelected ? 20 / globalScale : 5 / globalScale));
    }
  }, [selectedNode, groupBy]);

  const focusedAutoClusterMeta = useMemo(() => {
    if (!focusedAutoClusterId) return null;

    const apiIds = autoClusterData.clusterApiIds.get(focusedAutoClusterId) || [];
    const apisInCluster = apiIds
      .map(id => apiById.get(id))
      .filter(Boolean);

    return {
      id: focusedAutoClusterId,
      name: formatClusterName(focusedAutoClusterId),
      apiCount: apisInCluster.length,
      memberCount: autoClusterData.clusterMemberIds.get(focusedAutoClusterId)?.length || 0
    };
  }, [focusedAutoClusterId, autoClusterData, apiById]);

  const selectedApiMeta = useMemo(() => {
    if (!selectedNode || selectedNode.apisInside) return null;
    return apiById.get(selectedNode.id) || null;
  }, [selectedNode, apiById]);

  const selectedClusterApis = useMemo(() => {
    if (!selectedNode?.apisInside) return [] as ClusterListItem[];

    return [...selectedNode.apisInside]
      .map((id: string) => {
        const api = apiById.get(id);
        const fallbackNode = graphNodeById.get(id);

        return {
          id,
          name: api?.name || fallbackNode?.name || id,
          hasIssues: api ? api.issueCount > 0 : Boolean(fallbackNode?.hasIssues),
          level4: api?.level4,
          level5: api?.level5
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [selectedNode, apiById, graphNodeById]);

  const focusedClusterApis = useMemo(() => {
    if (!focusedAutoClusterId) return [] as ClusterListItem[];

    const apiIds = autoClusterData.clusterApiIds.get(focusedAutoClusterId) || [];
    return apiIds
      .map(id => {
        const api = apiById.get(id);
        const fallbackNode = graphNodeById.get(id);

        return {
          id,
          name: api?.name || fallbackNode?.name || id,
          hasIssues: api ? api.issueCount > 0 : Boolean(fallbackNode?.hasIssues),
          level4: api?.level4,
          level5: api?.level5
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [focusedAutoClusterId, autoClusterData, apiById, graphNodeById]);

  const isFocusedAutoClusterView = groupBy === 'autoCluster' && Boolean(focusedAutoClusterMeta);

  const handleFocusedClusterApiClick = useCallback((apiId: string) => {
    const targetNode = displayGraphData.nodes.find((node: any) => node.id === apiId);
    if (!targetNode) return;

    focusGraphNode(targetNode, 2.2);
  }, [displayGraphData, focusGraphNode]);

  const { upstreams, downstreams } = useMemo(() => {
    if (!selectedNode || !displayGraphData) return { upstreams: [], downstreams: [] };
    const getLinkId = (nodeRef: any) => typeof nodeRef === 'object' ? nodeRef.id : nodeRef;
    
    // Upstream (who calls this node) - looking for links where target is this node
    const ups = displayGraphData.links.filter((l: any) => getLinkId(l.target) === selectedNode.id).map((l: any) => getLinkId(l.source));
    // Downstream (who this node calls) - looking for links where source is this node
    const downs = displayGraphData.links.filter((l: any) => getLinkId(l.source) === selectedNode.id).map((l: any) => getLinkId(l.target));
    
    const mapNode = (id: string) => displayGraphData.nodes.find((n: any) => n.id === id);
    
    return {
      upstreams: ups.map(mapNode).filter(Boolean),
      downstreams: downs.map(mapNode).filter(Boolean)
    };
  }, [selectedNode, displayGraphData]);

  const graphCanvas = (
    <Box
      className="glass-panel"
      sx={{
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
        height: isFocusedAutoClusterView ? { xs: 520, lg: '100%' } : 'auto',
        overflow: 'hidden',
        borderRadius: 3,
        position: 'relative',
        bgcolor: '#ffffff',
        border: '1px solid rgba(0,0,0,0.08)',
        backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 0)',
        backgroundSize: '24px 24px'
      }}
      ref={containerRef}
    >
      <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'rgba(255,255,255,0.9)', p: 0.5, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)' }}>
        <IconButton size="small" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 400)}><ZoomInIcon /></IconButton>
        <Divider />
        <IconButton size="small" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 400)}><ZoomOutIcon /></IconButton>
        <Divider />
        <IconButton size="small" onClick={() => { fgRef.current?.zoomToFit(800, 50); setSelectedNode(null); }}><FilterCenterFocusIcon /></IconButton>
      </Box>

      <Box sx={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, display: 'flex', gap: 2, bgcolor: 'rgba(255,255,255,0.9)', px: 2, py: 1.5, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircleIcon sx={{ color: '#10b981', fontSize: 16 }} /><Typography variant="body2" fontWeight="500">Healthy</Typography></Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircleIcon sx={{ color: '#ef4444', fontSize: 16 }} /><Typography variant="body2" fontWeight="500">Alerting / Regressed</Typography></Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary" fontWeight="500" sx={{ ml: 1 }}>Dependency Flow</Typography></Box>
      </Box>

      {selectedNode && !isFocusedAutoClusterView && (
        <Card sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320, borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)', animation: 'fadeIn 0.3s ease-out' }}>
          <Box sx={{ bgcolor: selectedNode.hasIssues ? '#fee2e2' : '#f0fdf4', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid', borderColor: selectedNode.hasIssues ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)' }}>
            <Box>
              <Typography variant="caption" fontWeight="bold" color={selectedNode.hasIssues ? '#b91c1c' : '#047857'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {selectedNode.apisInside ? 'Aggregated Cluster' : 'Service Node'}
              </Typography>
              <Typography variant="h6" fontWeight="bold" sx={{ mt: 0.5, color: '#0f172a', lineHeight: 1.2 }}>{selectedNode.name}</Typography>
            </Box>
            <IconButton size="small" onClick={() => setSelectedNode(null)} sx={{ color: 'rgba(0,0,0,0.5)', mt: -0.5, mr: -0.5 }}><CloseIcon /></IconButton>
          </Box>
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: 'grid', gap: 2 }}>
              {selectedNode.apisInside && (
                <>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Cluster Capacity</Typography>
                    <Typography fontWeight="bold">{selectedNode.size} Internal Elements</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">APIs In Cluster</Typography>
                    <Typography fontWeight="bold">{selectedClusterApis.length} API Records</Typography>
                    <Box sx={{ mt: 1, maxHeight: 220, overflowY: 'auto', borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                      {selectedClusterApis.length > 0 ? (
                        selectedClusterApis.map(api => (
                          <Box key={api.id} sx={{ px: 1.5, py: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #e2e8f0', '&:last-of-type': { borderBottom: 'none' } }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {api.name}
                              </Typography>
                              {(api.level4 || api.level5) && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {[api.level4, api.level5].filter(Boolean).join(' / ')}
                                </Typography>
                              )}
                            </Box>
                            <CircleIcon sx={{ color: api.hasIssues ? '#ef4444' : '#10b981', fontSize: 12, flexShrink: 0 }} />
                          </Box>
                        ))
                      ) : (
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1.5, py: 1.25 }}>
                          No API records were mapped into this cluster.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Button
                    variant="outlined" color="primary" fullWidth sx={{ mt: 1, borderWidth: 2, '&:hover': { borderWidth: 2 } }}
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={() => {
                      if (groupBy === 'autoCluster') {
                        setFocusedAutoClusterId(selectedNode.id);
                        setSelectedNode(null);
                        return;
                      }

                      rememberNodePositions();
                      if (Number.isFinite(selectedNode.x) && Number.isFinite(selectedNode.y)) {
                        clusterAnchorsRef.current.set(selectedNode.id, { x: selectedNode.x, y: selectedNode.y });
                      }
                      setExpandedGroups(prev => new Set(prev).add(selectedNode.id));
                      setSelectedNode(null);
                    }}
                  >
                    Unpack Cluster Topology
                  </Button>
                </>
              )}

              {!selectedNode.apisInside && (
                <>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Global State</Typography>
                    <Typography fontWeight="bold" display="flex" alignItems="center" gap={1}>
                      {selectedNode.hasIssues ? <><CircleIcon sx={{ color: '#ef4444', fontSize: 12 }} /> Warning Active</> : <><CircleIcon sx={{ color: '#10b981', fontSize: 12 }} /> Operational</>}
                    </Typography>
                  </Box>

                  {selectedNode.originalGroupId && groupBy !== 'none' && expandedGroups.has(selectedNode.originalGroupId) && (
                    <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                      <Typography variant="caption" color="text.secondary" display="block">Parent Boundary</Typography>
                      <Typography fontWeight="bold" color="primary.main">{selectedNode.originalGroupName}</Typography>
                      <Button
                        variant="text" color="secondary" size="small" fullWidth sx={{ mt: 1 }}
                        startIcon={<LayersClearIcon />}
                        onClick={() => {
                          rememberNodePositions();
                          setExpandedGroups(prev => {
                            const n = new Set(prev);
                            n.delete(selectedNode.originalGroupId);
                            return n;
                          });
                          setSelectedNode(null);
                        }}
                      >
                        Re-collapse Boundary
                      </Button>
                    </Box>
                  )}

                  {selectedApiMeta && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Architecture Layer</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                        <Chip label={selectedApiMeta.level4} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                        <Chip label={selectedApiMeta.level5} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ pt: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Upstream (Callers)</Typography>
                    {upstreams.length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {(showAllDeps ? upstreams : upstreams.slice(0, 3)).map((n: any) => (
                          <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>閳?{n.name}</Typography>
                        ))}
                        {!showAllDeps && upstreams.length > 3 && (
                          <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                            + {upstreams.length - 3} more...
                          </Typography>
                        )}
                      </Box>
                    ) : <Typography variant="caption" color="text.disabled">No inbound connections</Typography>}
                  </Box>

                  <Box sx={{ pt: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Downstream (Dependencies)</Typography>
                    {downstreams.length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {(showAllDeps ? downstreams : downstreams.slice(0, 3)).map((n: any) => (
                          <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>閳?{n.name}</Typography>
                        ))}
                        {!showAllDeps && downstreams.length > 3 && (
                          <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                            + {downstreams.length - 3} more...
                          </Typography>
                        )}
                      </Box>
                    ) : <Typography variant="caption" color="text.disabled">No outbound dependencies</Typography>}
                  </Box>

                  {showAllDeps && (
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer', mt: 1, textAlign: 'center', display: 'block', '&:hover': { color: '#0f172a' } }} onClick={() => setShowAllDeps(false)}>
                      Collapse List
                    </Typography>
                  )}

                  {selectedApiMeta && (
                    <Button
                      variant="contained" color="primary" fullWidth endIcon={<OpenInNewIcon />} sx={{ mt: 1 }}
                      onClick={() => navigate(`/apis/${selectedNode.id}`)}
                    >
                      View API Trajectory
                    </Button>
                  )}
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={displayGraphData}
        autoPauseRedraw
        enableNodeDrag={false}
        d3AlphaDecay={performanceMode.alphaDecay}
        d3VelocityDecay={performanceMode.velocityDecay}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const size = (node as any).val || 6;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(size, 15), 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        linkColor={() => 'rgba(148, 163, 184, 0.4)'}
        linkWidth={l => Math.max(1.5, Math.min(6, ((l as any).callFrequency || 1) / 10000))}
        linkDirectionalParticles={l => {
          if (performanceMode.isVeryLargeGraph) return 0;
          if (performanceMode.isLargeGraph) return (l.target as any).hasIssues ? 1 : 0;
          return (l.target as any).hasIssues ? 3 : 1;
        }}
        linkDirectionalParticleSpeed={l => Math.max(0.003, Math.min(0.02, ((l as any).callFrequency || 1) / 60000))}
        linkDirectionalParticleWidth={l => performanceMode.isLargeGraph ? 1.5 : Math.max(2, Math.min(4, ((l as any).callFrequency || 1) / 20000))}
        linkDirectionalParticleColor={l => (l.target as any).hasIssues ? '#ef4444' : '#94a3b8'}
        linkLabel={l => `Call Vol: ${((l as any).callFrequency || 0).toLocaleString()} req/s`}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={rememberNodePositions}
        cooldownTicks={performanceMode.cooldownTicks}
      />
    </Box>
  );

  const focusedClusterSidebar = isFocusedAutoClusterView ? (
    <Card
      className="glass-panel"
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: { xs: 'auto', lg: '100%' },
        borderRadius: 3,
        border: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(148,163,184,0.18)', bgcolor: '#f8fafc' }}>
        <Typography variant="overline" fontWeight="bold" color="#4f46e5" sx={{ letterSpacing: 1 }}>
          Fixed API List
        </Typography>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#0f172a' }}>
          {focusedAutoClusterMeta?.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {focusedClusterApis.length} APIs. Click a row to focus the node in the graph.
        </Typography>
      </Box>

      <Box sx={{ flex: '0 0 auto', px: 2.5, py: 1.5, borderBottom: '1px solid rgba(148,163,184,0.18)', bgcolor: '#ffffff' }}>
        <Typography variant="caption" color="text.secondary">
          Left side shows the internal dependency graph. This list stays visible while you explore.
        </Typography>
      </Box>

      <Box sx={{ flex: '1 1 0', minHeight: 180, overflowY: 'auto', px: 1.5, py: 1.5, bgcolor: '#ffffff' }}>
        {focusedClusterApis.map(api => {
          const isSelected = selectedNode?.id === api.id;

          return (
            <Box
              key={api.id}
              onClick={() => handleFocusedClusterApiClick(api.id)}
              sx={{
                px: 1.25,
                py: 1.1,
                mb: 1,
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: isSelected ? '#818cf8' : 'rgba(226,232,240,0.95)',
                bgcolor: isSelected ? '#eef2ff' : '#f8fafc',
                transition: 'all 0.18s ease',
                '&:hover': {
                  bgcolor: isSelected ? '#e0e7ff' : '#f1f5f9',
                  borderColor: isSelected ? '#6366f1' : '#cbd5e1'
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {api.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[api.level4, api.level5].filter(Boolean).join(' / ') || api.id}
                  </Typography>
                </Box>
                <CircleIcon sx={{ color: api.hasIssues ? '#ef4444' : '#10b981', fontSize: 12, flexShrink: 0 }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ flex: '1 1 0', minHeight: 240, overflowY: 'auto', borderTop: '1px solid rgba(148,163,184,0.18)', bgcolor: '#f8fafc', p: 2.5 }}>
        {selectedNode ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box>
                <Typography variant="caption" fontWeight="bold" color={selectedNode.hasIssues ? '#b91c1c' : '#047857'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Service Node
                </Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ mt: 0.5, color: '#0f172a', lineHeight: 1.2 }}>
                  {selectedNode.name}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedNode(null)} sx={{ color: 'rgba(0,0,0,0.5)', mt: -0.5, mr: -0.5 }}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">Global State</Typography>
              <Typography fontWeight="bold" display="flex" alignItems="center" gap={1}>
                {selectedNode.hasIssues ? <><CircleIcon sx={{ color: '#ef4444', fontSize: 12 }} /> Warning Active</> : <><CircleIcon sx={{ color: '#10b981', fontSize: 12 }} /> Operational</>}
              </Typography>
            </Box>

            {selectedApiMeta && (
              <Box>
                <Typography variant="caption" color="text.secondary">Architecture Layer</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip label={selectedApiMeta?.level4 || 'Unknown'} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                  <Chip label={selectedApiMeta?.level5 || 'Unknown'} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                </Box>
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Upstream (Callers)</Typography>
              {upstreams.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {(showAllDeps ? upstreams : upstreams.slice(0, 5)).map((n: any) => (
                    <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>閳?{n.name}</Typography>
                  ))}
                  {!showAllDeps && upstreams.length > 5 && (
                    <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                      + {upstreams.length - 5} more...
                    </Typography>
                  )}
                </Box>
              ) : <Typography variant="caption" color="text.disabled">No inbound connections</Typography>}
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Downstream (Dependencies)</Typography>
              {downstreams.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {(showAllDeps ? downstreams : downstreams.slice(0, 5)).map((n: any) => (
                    <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>閳?{n.name}</Typography>
                  ))}
                  {!showAllDeps && downstreams.length > 5 && (
                    <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                      + {downstreams.length - 5} more...
                    </Typography>
                  )}
                </Box>
              ) : <Typography variant="caption" color="text.disabled">No outbound dependencies</Typography>}
            </Box>

            {showAllDeps && (
              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer', textAlign: 'center', display: 'block', '&:hover': { color: '#0f172a' } }} onClick={() => setShowAllDeps(false)}>
                Collapse List
              </Typography>
            )}

            {selectedApiMeta && (
              <Button
                variant="contained" color="primary" fullWidth endIcon={<OpenInNewIcon />}
                onClick={() => navigate(`/apis/${selectedNode.id}`)}
              >
                View API Trajectory
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight="bold" color="#0f172a">
              Node Details
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Select an API from the graph or from the list above to inspect its health and dependencies.
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  ) : null;

  return (
    <Box className="page-container" sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
            API Topology & Health Monitor
          </Typography>
          <Typography color="text.secondary">
            {focusedAutoClusterMeta
              ? `${focusedAutoClusterMeta.name} internal API dependency topology.`
              : 'Live infrastructure routing mapped via Force-Directed physics. Node pulses indicate active alerts.'}
          </Typography>
        </Box>
        
        <Card className="glass-panel" sx={{ px: 2, py: 0.5 }}>
          <Tabs value={groupBy} onChange={(_, val) => setGroupBy(val)} textColor="primary" indicatorColor="primary" 
            sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 1 } }}>
            <Tab 
              icon={<AutoAwesomeIcon sx={{ fontSize: '1rem', mr: 0.5, color: '#6366f1' }} />} 
              iconPosition="start" 
              label={<Typography fontWeight="bold" color="#6366f1">AI Autocluster</Typography>} 
              value="autoCluster" 
            />
            <Tab label="Service Nodes" value="none" />
            <Tab label="Level 4 Clusters" value="level4" />
            <Tab label="Level 5 Clusters" value="level5" />
          </Tabs>
        </Card>
      </Box>

      {groupBy === 'autoCluster' && focusedAutoClusterMeta && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', p: 2, borderRadius: 3, bgcolor: '#eef2ff', border: '1px solid rgba(99,102,241,0.18)' }}>
          <Box>
            <Typography variant="overline" fontWeight="bold" color="#4f46e5" sx={{ letterSpacing: 1 }}>
              Unpacked Cluster View
            </Typography>
            <Typography fontWeight="bold" sx={{ color: '#312e81' }}>
              {focusedAutoClusterMeta.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {focusedAutoClusterMeta.apiCount} APIs visible 路 {displayGraphData.links.length} internal dependency links
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ArrowBackIcon />}
            onClick={resetFocusedAutoClusterView}
          >
            Back To AI Autocluster
          </Button>
        </Box>
      )}
      
      {groupBy !== 'autoCluster' && expandedGroups.size > 0 && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" fontWeight="bold">Expanded Topologies:</Typography>
          {Array.from(expandedGroups).map(gid => (
            <Chip 
              key={gid} 
              label={gid} 
              onDelete={() => {
                rememberNodePositions();
                setExpandedGroups(prev => {
                  const n = new Set(prev);
                  n.delete(gid);
                  return n;
                });
              }} 
              color="primary" 
              size="small" 
              variant="outlined" 
            />
          ))}
          <Button size="small" variant="text" onClick={() => {
            rememberNodePositions();
            setExpandedGroups(new Set());
          }}>Reset All</Button>
        </Box>
      )}

      {isFocusedAutoClusterView ? (
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: { xs: 'flex', lg: 'grid' },
            flexDirection: 'column',
            gridTemplateColumns: { lg: 'minmax(0, 1fr) 360px' },
            gap: 2
          }}
        >
          {graphCanvas}
          {focusedClusterSidebar}
        </Box>
      ) : (
        graphCanvas
      )}

      {false && <Box className="glass-panel" sx={{ flexGrow: 1, overflow: 'hidden', borderRadius: 3, position: 'relative', bgcolor: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 0)', backgroundSize: '24px 24px' }} ref={containerRef}>
        <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'rgba(255,255,255,0.9)', p: 0.5, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)' }}>
          <IconButton size="small" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 400)}><ZoomInIcon /></IconButton>
          <Divider />
          <IconButton size="small" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 400)}><ZoomOutIcon /></IconButton>
          <Divider />
          <IconButton size="small" onClick={() => { fgRef.current?.zoomToFit(800, 50); setSelectedNode(null); }}><FilterCenterFocusIcon /></IconButton>
        </Box>

        <Box sx={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, display: 'flex', gap: 2, bgcolor: 'rgba(255,255,255,0.9)', px: 2, py: 1.5, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircleIcon sx={{ color: '#10b981', fontSize: 16 }} /><Typography variant="body2" fontWeight="500">Healthy</Typography></Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircleIcon sx={{ color: '#ef4444', fontSize: 16 }} /><Typography variant="body2" fontWeight="500">Alerting / Regressed</Typography></Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary" fontWeight="500" sx={{ ml: 1 }}>Dependency Flow</Typography></Box>
        </Box>

        {selectedNode && (
          <Card sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320, borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)', animation: 'fadeIn 0.3s ease-out' }}>
            <Box sx={{ bgcolor: selectedNode.hasIssues ? '#fee2e2' : '#f0fdf4', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid', borderColor: selectedNode.hasIssues ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)' }}>
              <Box>
                <Typography variant="caption" fontWeight="bold" color={selectedNode.hasIssues ? '#b91c1c' : '#047857'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  {selectedNode.apisInside ? 'Aggregated Cluster' : 'Service Node'}
                </Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ mt: 0.5, color: '#0f172a', lineHeight: 1.2 }}>{selectedNode.name}</Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedNode(null)} sx={{ color: 'rgba(0,0,0,0.5)', mt: -0.5, mr: -0.5 }}><CloseIcon /></IconButton>
            </Box>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'grid', gap: 2 }}>
                
                {/* Cluster Node Inspector */}
                {selectedNode.apisInside && (
                  <>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Cluster Capacity</Typography>
                      <Typography fontWeight="bold">{selectedNode.size} Internal Elements</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">APIs In Cluster</Typography>
                      <Typography fontWeight="bold">{selectedClusterApis.length} API Records</Typography>
                      <Box sx={{ mt: 1, maxHeight: 220, overflowY: 'auto', borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                        {selectedClusterApis.length > 0 ? (
                          selectedClusterApis.map(api => (
                            <Box key={api.id} sx={{ px: 1.5, py: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #e2e8f0', '&:last-of-type': { borderBottom: 'none' } }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {api.name}
                                </Typography>
                                {(api.level4 || api.level5) && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {[api.level4, api.level5].filter(Boolean).join(' / ')}
                                  </Typography>
                                )}
                              </Box>
                              <CircleIcon sx={{ color: api.hasIssues ? '#ef4444' : '#10b981', fontSize: 12, flexShrink: 0 }} />
                            </Box>
                          ))
                        ) : (
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1.5, py: 1.25 }}>
                            No API records were mapped into this cluster.
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Button 
                      variant="outlined" color="primary" fullWidth sx={{ mt: 1, borderWidth: 2, '&:hover': { borderWidth: 2 } }}
                      startIcon={<AddCircleOutlineIcon />}
                      onClick={() => {
                        if (groupBy === 'autoCluster') {
                          setFocusedAutoClusterId(selectedNode.id);
                          setSelectedNode(null);
                          return;
                        }

                        rememberNodePositions();
                        if (Number.isFinite(selectedNode.x) && Number.isFinite(selectedNode.y)) {
                          clusterAnchorsRef.current.set(selectedNode.id, { x: selectedNode.x, y: selectedNode.y });
                        }
                        setExpandedGroups(prev => new Set(prev).add(selectedNode.id));
                        setSelectedNode(null);
                      }}
                    >
                      Unpack Cluster Topology
                    </Button>
                  </>
                )}

                {/* Individual API Node Inspector */}
                {!selectedNode.apisInside && (
                  <>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Global State</Typography>
                      <Typography fontWeight="bold" display="flex" alignItems="center" gap={1}>
                        {selectedNode.hasIssues ? <><CircleIcon sx={{ color: '#ef4444', fontSize: 12 }} /> Warning Active</> : <><CircleIcon sx={{ color: '#10b981', fontSize: 12 }} /> Operational</>}
                      </Typography>
                    </Box>

                    {selectedNode.originalGroupId && groupBy !== 'none' && expandedGroups.has(selectedNode.originalGroupId) && (
                      <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Typography variant="caption" color="text.secondary" display="block">Parent Boundary</Typography>
                        <Typography fontWeight="bold" color="primary.main">{selectedNode.originalGroupName}</Typography>
                        <Button 
                          variant="text" color="secondary" size="small" fullWidth sx={{ mt: 1 }}
                          startIcon={<LayersClearIcon />}
                          onClick={() => {
                            rememberNodePositions();
                            setExpandedGroups(prev => {
                              const n = new Set(prev);
                              n.delete(selectedNode.originalGroupId);
                              return n;
                            });
                            setSelectedNode(null);
                          }}
                        >
                          Re-collapse Boundary
                        </Button>
                      </Box>
                    )}

                    {selectedApiMeta && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Architecture Layer</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip label={selectedApiMeta?.level4 || 'Unknown'} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                          <Chip label={selectedApiMeta?.level5 || 'Unknown'} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} />
                        </Box>
                      </Box>
                    )}

                    {!selectedNode.apisInside && (
                      <>
                        <Box sx={{ pt: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Upstream (Callers)</Typography>
                          {upstreams.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {(showAllDeps ? upstreams : upstreams.slice(0, 3)).map((n: any) => (
                                <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>鈥?{n.name}</Typography>
                              ))}
                              {!showAllDeps && upstreams.length > 3 && (
                                <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                                  + {upstreams.length - 3} more...
                                </Typography>
                              )}
                            </Box>
                          ) : <Typography variant="caption" color="text.disabled">No inbound connections</Typography>}
                        </Box>

                        <Box sx={{ pt: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Downstream (Dependencies)</Typography>
                          {downstreams.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {(showAllDeps ? downstreams : downstreams.slice(0, 3)).map((n: any) => (
                                <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>鈥?{n.name}</Typography>
                              ))}
                              {!showAllDeps && downstreams.length > 3 && (
                                <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowAllDeps(true)}>
                                  + {downstreams.length - 3} more...
                                </Typography>
                              )}
                            </Box>
                          ) : <Typography variant="caption" color="text.disabled">No outbound dependencies</Typography>}
                        </Box>

                        {showAllDeps && (
                           <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer', mt: 1, textAlign: 'center', display: 'block', '&:hover': { color: '#0f172a' } }} onClick={() => setShowAllDeps(false)}>
                             Collapse List
                           </Typography>
                        )}
                      </>
                    )}
                    
                    {selectedApiMeta && (
                      <Button 
                        variant="contained" color="primary" fullWidth endIcon={<OpenInNewIcon />} sx={{ mt: 1 }}
                        onClick={() => navigate(`/apis/${selectedNode.id}`)}
                      >
                        View API Trajectory
                      </Button>
                    )}
                  </>
                )}

              </Box>
            </CardContent>
          </Card>
        )}

        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={displayGraphData}
          autoPauseRedraw
          enableNodeDrag={false}
          d3AlphaDecay={performanceMode.alphaDecay}
          d3VelocityDecay={performanceMode.velocityDecay}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            const size = (node as any).val || 6;
            ctx.fillStyle = color;
            ctx.beginPath();
            // Increased hit area (min 15px radius) for better click reliability
            ctx.arc(node.x, node.y, Math.max(size, 15), 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkColor={() => 'rgba(148, 163, 184, 0.4)'}
          linkWidth={l => Math.max(1.5, Math.min(6, ((l as any).callFrequency || 1) / 10000))}
          linkDirectionalParticles={l => {
            if (performanceMode.isVeryLargeGraph) return 0;
            if (performanceMode.isLargeGraph) return (l.target as any).hasIssues ? 1 : 0;
            return (l.target as any).hasIssues ? 3 : 1;
          }}
          linkDirectionalParticleSpeed={l => Math.max(0.003, Math.min(0.02, ((l as any).callFrequency || 1) / 60000))}
          linkDirectionalParticleWidth={l => performanceMode.isLargeGraph ? 1.5 : Math.max(2, Math.min(4, ((l as any).callFrequency || 1) / 20000))}
          linkDirectionalParticleColor={l => (l.target as any).hasIssues ? '#ef4444' : '#94a3b8'}
          linkLabel={l => `Call Vol: ${((l as any).callFrequency || 0).toLocaleString()} req/s`}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          onEngineStop={rememberNodePositions}
          cooldownTicks={performanceMode.cooldownTicks}
        />
      </Box>}
    </Box>
  );
}

