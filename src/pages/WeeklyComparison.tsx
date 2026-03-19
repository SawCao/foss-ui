import { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, TextField, MenuItem, Tabs, Tab, TableSortLabel, CircularProgress, TablePagination } from '@mui/material';
import { useStore } from '../store/useStore';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';

type GroupBy = 'none' | 'level3' | 'level4' | 'level5';
type SortField = 'diff' | 'progress' | null;
type SortOrder = 'asc' | 'desc';

function ProgressCell({ prev, curr }: { prev: number, curr: number }) {
  if (prev === 0 && curr === 0) return <Typography variant="caption" color="text.secondary">No Issues</Typography>;
  const fixedCount = Math.max(0, prev - curr);
  const base = Math.max(prev, curr);
  const fixedPercent = base === 0 ? 100 : (fixedCount / base) * 100;
  const remPercent = 100 - fixedPercent;
  
  return (
    <Box sx={{ width: 120, display: 'flex', flexDirection: 'column', gap: 0.5, mx: 'auto' }}>
      <Box sx={{ width: '100%', height: 8, display: 'flex', borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.05)' }}>
        {fixedPercent > 0 && <Box sx={{ width: `${fixedPercent}%`, bgcolor: 'success.main' }} />}
        {remPercent > 0 && <Box sx={{ width: `${remPercent}%`, bgcolor: 'error.main' }} />}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="success.main" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>{fixedPercent.toFixed(0)}% Fixed</Typography>
        <Typography variant="caption" color="error.main" sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>{remPercent.toFixed(0)}% Rem</Typography>
      </Box>
    </Box>
  );
}

export default function WeeklyComparison() {
  const { snapshots, apis, isLoading } = useStore();

  const [filterLevel3, setFilterLevel3] = useState('');
  const [filterLevel4, setFilterLevel4] = useState('');
  const [filterLevel5, setFilterLevel5] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [snapshots]);

  const [currentSnapId, setCurrentSnapId] = useState<string>('');
  const [baseSnapId, setBaseSnapId] = useState<string>('');

  useEffect(() => {
    if (sortedSnapshots.length > 0 && !currentSnapId) setCurrentSnapId(sortedSnapshots[0].id);
    if (sortedSnapshots.length > 1 && !baseSnapId) setBaseSnapId(sortedSnapshots[1].id);
  }, [sortedSnapshots]);

  const level3Options = useMemo(() => [...new Set(apis.map(api => api.level3))], [apis]);
  const level4Options = useMemo(() => Array.from(new Set(apis.filter(a => !filterLevel3 || a.level3 === filterLevel3).map(a => a.level4))), [apis, filterLevel3]);
  const level5Options = useMemo(() => Array.from(new Set(apis.filter(a => (!filterLevel3 || a.level3 === filterLevel3) && (!filterLevel4 || a.level4 === filterLevel4)).map(a => a.level5))), [apis, filterLevel3, filterLevel4]);

  const rawComparisonData = useMemo(() => {
    if (!currentSnapId || !baseSnapId) return null;
    const latest = snapshots.find(s => s.id === currentSnapId);
    const previous = snapshots.find(s => s.id === baseSnapId);
    if (!latest || !previous) return null;

    const isSelfComparison = currentSnapId === baseSnapId;

    const data = latest.data.map(currentApi => {
      const prevApi = isSelfComparison ? currentApi : previous.data.find(p => p.id === currentApi.id);
      const prevIssues = prevApi ? prevApi.issueCount : 0;
      const currentIssues = currentApi.issueCount;
      const diff = currentIssues - prevIssues;

      return {
        ...currentApi,
        prevIssues,
        currentIssues,
        diff,
        status: currentIssues === 0 && prevIssues > 0 ? 'fixed' : diff > 0 ? 'worse' : diff < 0 && currentIssues > 0 ? 'better' : 'unchanged'
      };
    });

    return { data };
  }, [snapshots, currentSnapId, baseSnapId]);

  const displayData = useMemo(() => {
    if (!rawComparisonData) return [];
    
    let filtered = rawComparisonData.data.filter(api => {
      if (filterLevel3 && api.level3 !== filterLevel3) return false;
      if (filterLevel4 && api.level4 !== filterLevel4) return false;
      if (filterLevel5 && api.level5 !== filterLevel5) return false;
      return true;
    });

    if (groupBy === 'none') {
      return filtered.map(item => ({ type: 'api', ...item }));
    }

    const groups = new Map<string, any>();
    filtered.forEach(api => {
      const groupKey = api[groupBy as keyof typeof api] as string;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          name: `${groupBy.toUpperCase()}: ${groupKey}`,
          actions: {
            A: { prevIssues: 0, currentIssues: 0 },
            B: { prevIssues: 0, currentIssues: 0 },
            C: { prevIssues: 0, currentIssues: 0 },
          }
        });
      }
      const g = groups.get(groupKey);
      if (g.actions[api.action]) {
        g.actions[api.action].prevIssues += api.prevIssues;
        g.actions[api.action].currentIssues += api.currentIssues;
      }
    });
    
    return Array.from(groups.values()).map(g => ({ type: 'group', ...g }));
  }, [rawComparisonData, filterLevel3, filterLevel4, filterLevel5, groupBy]);

  const sortedData = useMemo(() => {
    if (!sortField) return displayData;
    
    return [...displayData].sort((a: any, b: any) => {
      let valA = 0; let valB = 0;
      
      if (sortField === 'diff') {
        if (groupBy === 'none') {
          valA = a.diff; valB = b.diff;
        } else {
          valA = ['A','B','C'].reduce((sum, act) => sum + (a.actions[act].currentIssues - a.actions[act].prevIssues), 0);
          valB = ['A','B','C'].reduce((sum, act) => sum + (b.actions[act].currentIssues - b.actions[act].prevIssues), 0);
        }
      } else if (sortField === 'progress') {
        const getProg = (item: any) => {
          if (groupBy === 'none') {
            if (item.prevIssues === 0 && item.currentIssues === 0) return 100;
            const fixC = Math.max(0, item.prevIssues - item.currentIssues);
            return (fixC / Math.max(item.prevIssues, item.currentIssues)) * 100;
          } else {
            let p = 0; let c = 0;
            ['A','B','C'].forEach(act => { p += item.actions[act].prevIssues; c += item.actions[act].currentIssues; });
            if (p === 0 && c === 0) return 100;
            const fixC = Math.max(0, p - c);
            const base = Math.max(p, c);
            return base === 0 ? 100 : (fixC / base) * 100;
          }
        };
        valA = getProg(a);
        valB = getProg(b);
      }
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [displayData, sortField, sortOrder, groupBy]);

  const paginatedData = useMemo(() => {
    return sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [sortedData, page, rowsPerPage]);

  const handleSort = (field: SortField) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortField(field);
    setPage(0);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const summary = useMemo(() => {
    let tf = 0; let tw = 0; let nc = 0;
    if (groupBy === 'none') {
      displayData.forEach((d: any) => {
        if (d.status === 'fixed') tf++;
        if (d.status === 'worse') tw++;
        nc += d.diff;
      });
    } else {
      displayData.forEach((g: any) => {
        ['A', 'B', 'C'].forEach(act => {
          const st = g.actions[act];
          const diff = st.currentIssues - st.prevIssues;
          if (st.currentIssues === 0 && st.prevIssues > 0) tf++;
          if (diff > 0) tw++;
          nc += diff;
        });
      });
    }
    return { totalFixed: tf, totalWorsened: tw, netChange: nc };
  }, [displayData, groupBy]);

  if (isLoading && apis.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 2 }}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">Computing historical data trends...</Typography>
      </Box>
    );
  }

  if (!rawComparisonData) return <Typography sx={{ p: 4 }}>Not enough data for comparison.</Typography>;

  return (
    <Box className="page-container">
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
        Weekly Issue Scan Comparison
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, mb: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography color="text.secondary" fontWeight="bold">Compare Baseline</Typography>
        <TextField 
          select
          size="small"
          value={baseSnapId}
          onChange={e => setBaseSnapId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {sortedSnapshots.map(s => <MenuItem key={s.id} value={s.id}>{s.date} ({s.id})</MenuItem>)}
        </TextField>
        <Typography color="text.secondary" fontWeight="bold">Against Current</Typography>
        <TextField 
          select
          size="small"
          value={currentSnapId}
          onChange={e => setCurrentSnapId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {sortedSnapshots.map(s => <MenuItem key={s.id} value={s.id}>{s.date} ({s.id})</MenuItem>)}
        </TextField>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, mb: 4 }}>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>{groupBy === 'none' ? 'APIs' : 'Action Dimensions'} Fully Fixed</Typography>
            <Typography variant="h3" fontWeight="bold" color="success.main">{summary.totalFixed}</Typography>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>New Regressions (Worse)</Typography>
            <Typography variant="h3" fontWeight="bold" color="error.main">{summary.totalWorsened}</Typography>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent>
            <Typography color="text.secondary" gutterBottom>Net Issue Change</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h3" fontWeight="bold" color={summary.netChange > 0 ? 'error.main' : summary.netChange < 0 ? 'success.main' : 'text.primary'}>
                {summary.netChange > 0 ? '+' : ''}{summary.netChange}
              </Typography>
              {summary.netChange > 0 ? <TrendingUpIcon color="error" fontSize="large" /> : summary.netChange < 0 ? <TrendingDownIcon color="success" fontSize="large" /> : <TrendingFlatIcon fontSize="large" />}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Card className="glass-panel" sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={groupBy} onChange={(_, val) => { setGroupBy(val); setSortField(null); setPage(0); }} textColor="primary" indicatorColor="primary">
              <Tab label="Individual APIs (No Grouping)" value="none" />
              <Tab label="Group By Level 3" value="level3" />
              <Tab label="Group By Level 4" value="level4" />
              <Tab label="Group By Level 5" value="level5" />
            </Tabs>
          </Box>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <TextField select label="Filter Level 3" value={filterLevel3} onChange={e => { setFilterLevel3(e.target.value); setFilterLevel4(''); setFilterLevel5(''); setPage(0); }} sx={{ minWidth: 200 }} size="small" variant="outlined">
              <MenuItem value=""><em>All</em></MenuItem>
              {level3Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
            </TextField>
            <TextField select label="Filter Level 4" value={filterLevel4} onChange={e => { setFilterLevel4(e.target.value); setFilterLevel5(''); setPage(0); }} sx={{ minWidth: 200 }} size="small" variant="outlined" disabled={!filterLevel3}>
              <MenuItem value=""><em>All</em></MenuItem>
              {level4Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
            </TextField>
            <TextField select label="Filter Level 5" value={filterLevel5} onChange={e => { setFilterLevel5(e.target.value); setPage(0); }} sx={{ minWidth: 200 }} size="small" variant="outlined" disabled={!filterLevel4}>
              <MenuItem value=""><em>All</em></MenuItem>
              {level5Options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
            </TextField>
          </Box>
        </CardContent>
      </Card>

      <TableContainer component={Box} className="glass-panel">
        <Table key={groupBy}>
          <TableHead>
            <TableRow>
              <TableCell>{groupBy === 'none' ? 'API Name' : 'Aggregated Group'}</TableCell>
              <TableCell align="center">Action</TableCell>
              <TableCell align="center">Previous Issues</TableCell>
              <TableCell align="center">Current Issues</TableCell>
              <TableCell align="center">
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <TableSortLabel
                    active={sortField === 'diff'}
                    direction={sortField === 'diff' ? sortOrder : 'asc'}
                    onClick={() => handleSort('diff')}
                    sx={{ '& .MuiTableSortLabel-icon': { opacity: sortField === 'diff' ? 1 : 0.4 } }}
                  >
                    Difference
                  </TableSortLabel>
                </Box>
              </TableCell>
              <TableCell align="center">
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <TableSortLabel
                    active={sortField === 'progress'}
                    direction={sortField === 'progress' ? sortOrder : 'asc'}
                    onClick={() => handleSort('progress')}
                    sx={{ '& .MuiTableSortLabel-icon': { opacity: sortField === 'progress' ? 1 : 0.4 } }}
                  >
                    Resolution Progress
                  </TableSortLabel>
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row: any) => {
              if (row.type === 'api') {
                return (
                  <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                    <TableCell component="th" scope="row">
                      <Typography fontWeight="bold" color="primary.dark">{row.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.repoUrl}</Typography>
                    </TableCell>
                    <TableCell align="center"><Chip label={`Action ${row.action}`} size="small" /></TableCell>
                    <TableCell align="center">
                      <Typography color="text.secondary">{row.prevIssues}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography fontWeight="bold" color={row.currentIssues > 0 ? 'error.main' : 'success.main'}>
                        {row.currentIssues}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Chip 
                          size="small"
                          icon={row.diff > 0 ? <TrendingUpIcon /> : row.diff < 0 ? <TrendingDownIcon /> : <TrendingFlatIcon />}
                          label={Math.abs(row.diff)}
                          color={row.diff > 0 ? 'error' : row.diff < 0 ? 'success' : 'default'}
                          variant={row.diff === 0 ? 'outlined' : 'filled'}
                        />
                        {row.prevIssues > 0 && row.diff !== 0 && (
                          <Typography variant="caption" color={row.diff > 0 ? 'error.main' : 'success.main'} fontWeight="bold">
                            {row.diff > 0 ? '+' : ''}{((row.diff / row.prevIssues) * 100).toFixed(0)}%
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <ProgressCell prev={row.prevIssues} curr={row.currentIssues} />
                    </TableCell>
                  </TableRow>
                );
              } else {
                const actions: ('A'|'B'|'C')[] = ['A', 'B', 'C'];
                return actions.map((act, index) => {
                  const stats = row.actions[act];
                  const diff = stats.currentIssues - stats.prevIssues;
                  
                  return (
                    <TableRow key={`${row.id}-${act}`} sx={{ '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' } }}>
                      {index === 0 && (
                        <TableCell rowSpan={3} sx={{ borderRight: '1px solid rgba(226, 232, 240, 0.8)', verticalAlign: 'top', pt: 3, width: '25%' }}>
                          <Typography fontWeight="bold" color="primary.dark" variant="h6">{row.name}</Typography>
                        </TableCell>
                      )}
                      <TableCell align="center">
                        <Chip label={`Action ${act}`} size="small" variant="outlined" color="primary" sx={{ fontWeight: 'bold' }} />
                      </TableCell>
                      <TableCell align="center"><Typography color="text.secondary">{stats.prevIssues}</Typography></TableCell>
                      <TableCell align="center">
                        <Typography fontWeight="bold" color={stats.currentIssues > 0 ? 'error.main' : 'success.main'}>
                          {stats.currentIssues}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                          <Chip 
                            size="small"
                            icon={diff > 0 ? <TrendingUpIcon /> : diff < 0 ? <TrendingDownIcon /> : <TrendingFlatIcon />}
                            label={Math.abs(diff)}
                            color={diff > 0 ? 'error' : diff < 0 ? 'success' : 'default'}
                            variant={diff === 0 ? 'outlined' : 'filled'}
                          />
                          {stats.prevIssues > 0 && diff !== 0 && (
                            <Typography variant="caption" color={diff > 0 ? 'error.main' : 'success.main'} fontWeight="bold">
                              {diff > 0 ? '+' : ''}{((diff / stats.prevIssues) * 100).toFixed(0)}%
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <ProgressCell prev={stats.prevIssues} curr={stats.currentIssues} />
                      </TableCell>
                    </TableRow>
                  );
                });
              }
            })}
            {sortedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No items match your filters.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={sortedData.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}
        />
      </TableContainer>
    </Box>
  );
}
