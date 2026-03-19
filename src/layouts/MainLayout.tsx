import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function MainLayout() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          height: '100vh', 
          overflow: 'auto',
          pt: 4,
          pb: 4,
          px: { xs: 2, sm: 4, md: 6 }
        }}
        className="animate-fade-in"
      >
        <Outlet />
      </Box>
    </Box>
  );
}
