import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Chip, IconButton, Button, TextField, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GitHubIcon from '@mui/icons-material/GitHub';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ExtensionIcon from '@mui/icons-material/Extension';
import SearchIcon from '@mui/icons-material/Search';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useStore } from '../store/useStore';

export default function ApiDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apis, fixSummaries, graphData } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  const api = useMemo(() => apis.find(a => a.id === id), [apis, id]);
  
  const { upstreams, downstreams } = useMemo(() => {
    if (!api || !graphData) return { upstreams: [], downstreams: [] };
    const getLinkId = (nodeRef: any) => typeof nodeRef === 'object' ? nodeRef.id : nodeRef;
    const ups = graphData.links.filter((l: any) => getLinkId(l.target) === api.id).map((l: any) => getLinkId(l.source));
    const downs = graphData.links.filter((l: any) => getLinkId(l.source) === api.id).map((l: any) => getLinkId(l.target));
    const mapNode = (nodeId: string) => graphData.nodes.find((n: any) => n.id === nodeId);
    return {
      upstreams: ups.map(mapNode).filter(Boolean),
      downstreams: downs.map(mapNode).filter(Boolean)
    };
  }, [api, graphData]);
  
  const relatedFixes = useMemo(() => {
    if (!api) return [];
    return fixSummaries.filter(f => f.apiId === api.id && (f.issueName.toLowerCase().includes(searchQuery.toLowerCase()) || f.summary.toLowerCase().includes(searchQuery.toLowerCase())));
  }, [api, fixSummaries, searchQuery]);

  if (!api) return <Box sx={{ p: 4 }}><Typography>API not found.</Typography></Box>;

  return (
    <Box className="page-container">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton onClick={() => navigate('/apis')}><ArrowBackIcon /></IconButton>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {api.name}
            <Chip 
              label={`${api.issueCount} Active Issues`} 
              color={api.issueCount > 0 ? 'error' : 'success'} 
              variant="outlined"
            />
          </Typography>
          <Typography color="text.secondary">Platform: {api.platform} | Action: {api.action}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
        {/* Left Column: Actions and Fixes */}
        <Box sx={{ flex: '0 0 350px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Quick Links</Typography>
              {api.repoUrl && (
                <Button fullWidth variant="outlined" startIcon={<GitHubIcon />} href={api.repoUrl} target="_blank" sx={{ mb: 1, justifyContent: 'flex-start' }}>
                  GitHub Repository
                </Button>
              )}
              {api.reportUrl && (
                <Button fullWidth variant="outlined" color="secondary" startIcon={<AssessmentIcon />} href={api.reportUrl} target="_blank" sx={{ mb: 1, justifyContent: 'flex-start' }}>
                  Main Scan Report
                </Button>
              )}
              {api.pluginReportUrl && (
                <Button fullWidth variant="outlined" color="info" startIcon={<ExtensionIcon />} href={api.pluginReportUrl} target="_blank" sx={{ justifyContent: 'flex-start' }}>
                  Plugin Scan Report
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Dependency Trace</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight="bold">Upstream (Callers)</Typography>
              {upstreams.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5, mb: 2 }}>
                  {upstreams.map((n: any) => <Typography key={n.id} variant="body2" sx={{ cursor: n.id.startsWith('api-') ? 'pointer' : 'default', '&:hover': { color: n.id.startsWith('api-') ? 'primary.main' : 'inherit', textDecoration: n.id.startsWith('api-') ? 'underline' : 'none' } }} onClick={() => n.id.startsWith('api-') && navigate(`/apis/${n.id}`)}>• {n.name}</Typography>)}
                </Box>
              ) : <Typography variant="body2" color="text.disabled" sx={{ mb: 2, mt: 0.5 }}>No inbound callers.</Typography>}

              <Typography variant="caption" color="text.secondary" fontWeight="bold">Downstream (Target Dependencies)</Typography>
              {downstreams.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                  {downstreams.map((n: any) => <Typography key={n.id} variant="body2" sx={{ cursor: n.id.startsWith('api-') ? 'pointer' : 'default', '&:hover': { color: n.id.startsWith('api-') ? 'primary.main' : 'inherit', textDecoration: n.id.startsWith('api-') ? 'underline' : 'none' } }} onClick={() => n.id.startsWith('api-') && navigate(`/apis/${n.id}`)}>• {n.name}</Typography>)}
                </Box>
              ) : <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>No outbound dependencies.</Typography>}
            </CardContent>
          </Card>

          <Card className="glass-panel" sx={{ flexGrow: 1 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoFixHighIcon color="primary" /> Agent Fixes
              </Typography>
              <TextField 
                fullWidth size="small" placeholder="Search fixes..." variant="filled" sx={{ mb: 3 }}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              />
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {relatedFixes.map(fix => (
                  <Box key={fix.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.5)', borderRadius: 2, border: '1px solid rgba(0,0,0,0.05)' }}>
                    <Typography variant="subtitle2" fontWeight="bold" color="primary.main">{fix.issueName}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>{fix.summary}</Typography>
                    <Typography variant="caption" color="text.disabled">{fix.date}</Typography>
                  </Box>
                ))}
                {relatedFixes.length === 0 && <Typography color="text.secondary" align="center" variant="body2">No fixes found.</Typography>}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Right Column: Full Metadata Viewer */}
        <Box sx={{ flex: 1 }}>
          <Card className="glass-panel">
            <CardContent sx={{ p: '0 !important' }}>
              <Box sx={{ p: 3, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <Typography variant="h6" fontWeight="bold">Comprehensive Metadata (Raw CSV)</Typography>
                <Typography variant="body2" color="text.secondary">Complete scan output and configuration data.</Typography>
              </Box>
              
              <TableContainer sx={{ maxHeight: 'calc(100vh - 250px)' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '40%', fontWeight: 'bold' }}>Property</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(api.rawDetails || {}).map(([key, val]) => (
                      <TableRow key={key} hover>
                        <TableCell sx={{ color: 'text.secondary', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{key}</TableCell>
                        <TableCell sx={{ wordBreak: 'break-word', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {String(val || '-')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!api.rawDetails || Object.keys(api.rawDetails).length === 0) && (
                      <TableRow>
                        <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No raw data available.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
