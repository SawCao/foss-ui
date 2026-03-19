import { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, IconButton, Tooltip, Link, Menu, Checkbox, ListItemText, Divider } from '@mui/material';
import { useStore } from '../store/useStore';
import { Link as RouterLink } from 'react-router-dom';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import GitHubIcon from '@mui/icons-material/GitHub';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExtensionIcon from '@mui/icons-material/Extension';

const statusConfig = {
  success: { color: 'success', icon: <CheckCircleIcon fontSize="small" />, label: 'Success' },
  failed: { color: 'error', icon: <ErrorOutlineIcon fontSize="small" />, label: 'Failed' },
  in_progress: { color: 'info', icon: <AutorenewIcon fontSize="small" className="animate-spin" />, label: 'In Progress' },
  waiting: { color: 'warning', icon: <PendingIcon fontSize="small" />, label: 'Waiting' }
} as const;

export default function ApiList() {
  const { apis } = useStore();
  const [filterLevel3, setFilterLevel3] = useState('');
  const [filterLevel4, setFilterLevel4] = useState('');
  const [filterLevel5, setFilterLevel5] = useState('');
  
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const level3Options = useMemo(() => [...new Set(apis.map(api => api.level3))], [apis]);
  const level4Options = useMemo(() => Array.from(new Set(apis.filter(a => !filterLevel3 || a.level3 === filterLevel3).map(a => a.level4))), [apis, filterLevel3]);
  const level5Options = useMemo(() => Array.from(new Set(apis.filter(a => (!filterLevel3 || a.level3 === filterLevel3) && (!filterLevel4 || a.level4 === filterLevel4)).map(a => a.level5))), [apis, filterLevel3, filterLevel4]);

  const filteredApis = useMemo(() => {
    return apis.filter(api => {
      if (filterLevel3 && api.level3 !== filterLevel3) return false;
      if (filterLevel4 && api.level4 !== filterLevel4) return false;
      if (filterLevel5 && api.level5 !== filterLevel5) return false;
      if (filterStatus.length > 0 && !filterStatus.includes(api.scanStatus)) return false;
      return true;
    });
  }, [apis, filterLevel3, filterLevel4, filterLevel5, filterStatus]);

  const summary = useMemo(() => {
    return {
      total: filteredApis.length,
      issues: filteredApis.reduce((acc, api) => acc + api.issueCount, 0),
      failedScans: filteredApis.filter(a => a.scanStatus === 'failed').length,
    };
  }, [filteredApis]);

  const handleStatusFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleStatusFilterClose = () => {
    setAnchorEl(null);
  };
  const toggleStatusFilter = (status: string) => {
    setFilterStatus(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  return (
    <Box className="page-container">
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1 }}>
        API Repository List
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, mb: 4 }}>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>Total APIs</Typography>
            <Typography variant="h3" fontWeight="bold" color="primary.main">{summary.total}</Typography>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>Total Issues Detected</Typography>
            <Typography variant="h3" fontWeight="bold" sx={{ color: summary.issues > 0 ? 'error.main' : 'success.main' }}>
              {summary.issues}
            </Typography>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>Failed Scans</Typography>
            <Typography variant="h3" fontWeight="bold" color="warning.main">{summary.failedScans}</Typography>
          </CardContent>
        </Card>
      </Box>

      <Card className="glass-panel" sx={{ mb: 4 }}>
        <CardContent sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <TextField select label="Org Level 3" value={filterLevel3} onChange={e => { setFilterLevel3(e.target.value); setFilterLevel4(''); setFilterLevel5(''); }} sx={{ minWidth: 200 }} size="small" variant="filled">
            <MenuItem value=""><em>All</em></MenuItem>
            {level3Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
          </TextField>
          <TextField select label="Org Level 4" value={filterLevel4} onChange={e => { setFilterLevel4(e.target.value); setFilterLevel5(''); }} sx={{ minWidth: 200 }} size="small" variant="filled" disabled={!filterLevel3}>
            <MenuItem value=""><em>All</em></MenuItem>
            {level4Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
          </TextField>
          <TextField select label="Org Level 5" value={filterLevel5} onChange={e => setFilterLevel5(e.target.value)} sx={{ minWidth: 200 }} size="small" variant="filled" disabled={!filterLevel4}>
            <MenuItem value=""><em>All</em></MenuItem>
            {level5Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
          </TextField>
        </CardContent>
      </Card>

      <TableContainer component={Box} className="glass-panel" sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow>
              <TableCell>API Name</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Org Attributes</TableCell>
              <TableCell>Links</TableCell>
              <TableCell align="center">Active Issues</TableCell>
              <TableCell align="center">
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Scan Status
                  <IconButton size="small" onClick={handleStatusFilterClick} color={filterStatus.length > 0 ? "primary" : "default"}>
                    <FilterListIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleStatusFilterClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <MenuItem key={key} onClick={() => toggleStatusFilter(key)} dense>
                      <Checkbox checked={filterStatus.includes(key)} size="small" />
                      <ListItemText primary={config.label} />
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem onClick={() => setFilterStatus([])} sx={{ justifyContent: 'center' }} disabled={filterStatus.length === 0}>
                    <Typography color="secondary" variant="body2">Clear Filter</Typography>
                  </MenuItem>
                </Menu>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredApis.map((api) => {
              const statusInfo = statusConfig[api.scanStatus as keyof typeof statusConfig];
              return (
                <TableRow key={api.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { backgroundColor: 'rgba(0,0,0,0.03)' } }}>
                  <TableCell component="th" scope="row">
                    <Typography fontWeight="600" component={RouterLink} to={`/apis/${api.id}`} sx={{ textDecoration: 'none', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
                      {api.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">ID: {api.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography color="text.secondary" fontWeight="500">{api.platform}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={`L3: ${api.level3}`} size="small" variant="outlined" sx={{ borderColor: 'rgba(0,0,0,0.1)' }} />
                      <Chip label={`L4: ${api.level4}`} size="small" variant="outlined" sx={{ borderColor: 'rgba(0,0,0,0.1)' }} />
                      <Chip label={`L5: ${api.level5}`} size="small" variant="outlined" sx={{ borderColor: 'rgba(0,0,0,0.1)' }} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Repository">
                      <IconButton component={Link} href={api.repoUrl} target="_blank" color="primary" size="small">
                        <GitHubIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="View Main Scan Report">
                      <IconButton component={Link} href={api.reportUrl} target="_blank" color="secondary" size="small">
                        <AssessmentIcon />
                      </IconButton>
                    </Tooltip>
                    {api.pluginReportUrl && (
                      <Tooltip title="View Plugin Dependencies Report">
                        <IconButton component={Link} href={api.pluginReportUrl} target="_blank" color="info" size="small">
                          <ExtensionIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Box component="span" sx={{ ml: 1, fontSize: '0.8rem', color: 'text.secondary', display: 'inline-flex', alignItems: 'center', p: 0.5, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                      {api.branch}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      icon={<BugReportIcon />} 
                      label={api.issueCount} 
                      color={api.issueCount > 0 ? 'error' : 'success'} 
                      variant={api.issueCount > 0 ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      icon={statusInfo.icon} 
                      label={statusInfo.label} 
                      color={statusInfo.color as any} 
                      sx={{ minWidth: 120, justifyContent: 'flex-start', pl: 1, ...((api.scanStatus === 'in_progress' || api.scanStatus === 'waiting') && { borderColor: 'rgba(0,0,0,0.2)', variant: 'outlined' }) }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredApis.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No APIs found matching the current filters.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
