import { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, TextField, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link } from '@mui/material';
import { useStore } from '../store/useStore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';

export default function BatchSummaries() {
  const { fixSummaries, apis } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const enrichedSummaries = useMemo(() => {
    let list = fixSummaries.map(s => {
      const api = apis.find(a => a.id === s.apiId);
      return { ...s, apiName: api?.name || 'Unknown API', level4: api?.level4 || 'Unknown' };
    });
    
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(s => 
        s.issueName.toLowerCase().includes(lower) || 
        s.summary.toLowerCase().includes(lower) ||
        s.apiName.toLowerCase().includes(lower)
      );
    }
    
    // Sort by date descending
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fixSummaries, apis, searchTerm]);

  return (
    <Box className="page-container">
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <AutoFixHighIcon color="secondary" fontSize="large" />
        Global AI Fix Records
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        A centralized view of all successful automated issue resolutions by AI agents.
      </Typography>

      <Card className="glass-panel" sx={{ mb: 4 }}>
        <CardContent>
          <TextField 
            fullWidth
            placeholder="Search across all fix summaries, APIs, or issue names..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon color="action" sx={{ mr: 1, fontSize: 24 }} />
            }}
            variant="filled"
            sx={{ '& .MuiFilledInput-root': { py: 1, borderRadius: 2 } }}
          />
        </CardContent>
      </Card>

      <TableContainer component={Box} className="glass-panel">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>API Details</TableCell>
              <TableCell width="30%">Issue Resolved</TableCell>
              <TableCell width="40%">Fix Explanation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {enrichedSummaries.map((row) => (
              <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' } }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography fontWeight="500">{row.date}</Typography>
                </TableCell>
                <TableCell>
                  <Typography fontWeight="bold" color="primary.light">
                    <Link href={`/apis/${row.apiId}`} underline="hover" color="inherit">
                      {row.apiName}
                    </Link>
                  </Typography>
                  <Chip size="small" label={row.level4} variant="outlined" sx={{ mt: 0.5, color: 'text.secondary', borderColor: 'rgba(255,255,255,0.1)' }} />
                </TableCell>
                <TableCell>
                  <Typography fontWeight="500" color="secondary.light">{row.issueName}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                    {row.summary}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {enrichedSummaries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">No fix records match your search criteria.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
