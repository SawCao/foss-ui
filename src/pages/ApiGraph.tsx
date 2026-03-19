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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { detectCommunities } from '../utils/louvain';
import { forceCollide, forceRadial } from 'd3-force';

export default function ApiGraph() {
  const { graphData, apis, isLoading } = useStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [groupBy, setGroupBy] = useState<'none' | 'autoCluster' | 'level4' | 'level5'>('none');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
  }, [groupBy]);

  const displayGraphData = useMemo(() => {
    const getLinkId = (nodeRef: any) => typeof nodeRef === 'object' ? nodeRef.id : nodeRef;
    
    let communities: Record<string, number> = {};
    if (groupBy === 'autoCluster') {
      const nodesStrings = graphData.nodes.map(n => String(n.id));
      const edgesData = graphData.links.map((l: any) => ({
        source: String(getLinkId(l.source)),
        target: String(getLinkId(l.target)),
        weight: l.callFrequency || 1
      }));
      communities = detectCommunities(nodesStrings, edgesData);
    }

    const newNodes = new Map();
    const newLinks = new Map();
    const nodeIdToGroup = new Map();

    graphData.nodes.forEach(node => {
      const api = apis.find(a => a.id === node.id);
      let groupId = String(node.id);
      let groupName = node.name;
      let targetGroupId = '';
      let targetGroupName = '';
      
      if (groupBy === 'autoCluster') {
        const clusterId = communities[String(node.id)] || 0;
        targetGroupId = `AI-Cluster-${clusterId}`;
        targetGroupName = `AI Cluster ${clusterId}`;
      } else if (api && (groupBy === 'level4' || groupBy === 'level5')) {
        targetGroupId = String(api[groupBy as 'level4' | 'level5']) || 'Unknown';
        targetGroupName = `${groupBy.toUpperCase()}: ${targetGroupId}`;
      } else {
        targetGroupId = `Infrastructure: ${node.name}`;
        targetGroupName = node.name;
      }
      
      if (groupBy !== 'none') {
        if (expandedGroups.has(targetGroupId)) {
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
          originalGroupName: targetGroupName
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
  }, [graphData, apis, groupBy, expandedGroups]);

  useEffect(() => {
    if (fgRef.current) {
      const maxDegree = Math.max(1, ...displayGraphData.nodes.map((n: any) => n.degree || 0));

      fgRef.current.d3Force('link').distance((link: any) => {
        const freq = link.callFrequency || 1;
        // Tighter link constraints limit maximum explosion distance
        return Math.max(20, Math.min(100, 100000 / (freq + 1000))); 
      });

      // Prevents overlap perfectly with tighter margin
      fgRef.current.d3Force('collide', forceCollide((node: any) => (node.val || 6) + 12).iterations(2));

      // Discrete Concentric Orbit Physics
      fgRef.current.d3Force('radial', forceRadial(
        (node: any) => {
          const invertedScore = 1 - ((node.degree || 0) / maxDegree);
          
          if (invertedScore < 0.15) return 0;         // Core Matrix (absolute center)
          if (invertedScore < 0.4) return 90;         // Inner Orbit
          if (invertedScore < 0.7) return 190;        // Middle Orbit
          return 300;                                 // Outer Rim Orbit
        },
        0, 0
      ).strength(1.5)); // High strength snaps nodes tightly onto their designated ring tracks

      // Drastically lower charge repulsion to prevent the graph from exploding outward
      fgRef.current.d3Force('charge').strength(-30);

      fgRef.current.d3ReheatSimulation();
    }
  }, [displayGraphData, groupBy]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 800);
      fgRef.current.zoom(2, 800);
    }
  }, []);

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

  const selectedApiMeta = useMemo(() => {
    if (!selectedNode || selectedNode.apisInside) return null;
    return apis.find(a => a.id === selectedNode.id);
  }, [selectedNode, apis]);

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

  return (
    <Box className="page-container" sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
            API Topology & Health Monitor
          </Typography>
          <Typography color="text.secondary">
            Live infrastructure routing mapped via Force-Directed physics. Node pulses indicate active alerts.
          </Typography>
        </Box>
        
        <Card className="glass-panel" sx={{ px: 2, py: 0.5 }}>
          <Tabs value={groupBy} onChange={(_, val) => setGroupBy(val)} textColor="primary" indicatorColor="primary" 
            sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 1 } }}>
            <Tab label="Service Nodes" value="none" />
            <Tab 
              icon={<AutoAwesomeIcon sx={{ fontSize: '1rem', mr: 0.5, color: '#6366f1' }} />} 
              iconPosition="start" 
              label={<Typography fontWeight="bold" color="#6366f1">AI Autocluster</Typography>} 
              value="autoCluster" 
            />
            <Tab label="Level 4 Clusters" value="level4" />
            <Tab label="Level 5 Clusters" value="level5" />
          </Tabs>
        </Card>
      </Box>
      
      {expandedGroups.size > 0 && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" fontWeight="bold">Expanded Topologies:</Typography>
          {Array.from(expandedGroups).map(gid => (
            <Chip 
              key={gid} 
              label={gid} 
              onDelete={() => setExpandedGroups(prev => { const n = new Set(prev); n.delete(gid); return n; })} 
              color="primary" 
              size="small" 
              variant="outlined" 
            />
          ))}
          <Button size="small" variant="text" onClick={() => setExpandedGroups(new Set())}>Reset All</Button>
        </Box>
      )}

      <Box className="glass-panel" sx={{ flexGrow: 1, overflow: 'hidden', borderRadius: 3, position: 'relative', bgcolor: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 0)', backgroundSize: '24px 24px' }} ref={containerRef}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary" fontWeight="500" sx={{ ml: 1 }}>Dependency Flow →</Typography></Box>
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
                    <Button 
                      variant="outlined" color="primary" fullWidth sx={{ mt: 1, borderWidth: 2, '&:hover': { borderWidth: 2 } }}
                      startIcon={<AddCircleOutlineIcon />}
                      onClick={() => {
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

                    {!selectedNode.apisInside && (
                      <>
                        <Box sx={{ pt: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Upstream (Callers)</Typography>
                          {upstreams.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {(showAllDeps ? upstreams : upstreams.slice(0, 3)).map((n: any) => (
                                <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>• {n.name}</Typography>
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
                                <Typography key={n.id} variant="body2" sx={{ fontSize: '0.75rem', color: '#0f172a' }}>• {n.name}</Typography>
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
          linkDirectionalParticles={l => (l.target as any).hasIssues ? 3 : 1}
          linkDirectionalParticleSpeed={l => Math.max(0.003, Math.min(0.02, ((l as any).callFrequency || 1) / 60000))}
          linkDirectionalParticleWidth={l => Math.max(2, Math.min(4, ((l as any).callFrequency || 1) / 20000))}
          linkDirectionalParticleColor={l => (l.target as any).hasIssues ? '#ef4444' : '#94a3b8'}
          linkLabel={l => `Call Vol: ${((l as any).callFrequency || 0).toLocaleString()} req/s`}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          cooldownTicks={100}
        />
      </Box>
    </Box>
  );
}
