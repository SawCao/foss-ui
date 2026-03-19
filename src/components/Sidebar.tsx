import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';


const drawerWidth = 280;

const menuItems = [
  { text: 'API List', path: '/apis', icon: <DashboardIcon /> },
  { text: 'Weekly Comparison', path: '/comparison', icon: <CompareArrowsIcon /> },
  { text: 'Network Graph', path: '/graph', icon: <AccountTreeIcon /> },
  { text: 'Fix Summaries', path: '/summaries', icon: <AssignmentTurnedInIcon /> },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flexShrink: 0 }}>
          <img src="/hsbc-logo.png" alt="HSBC" style={{ width: 40, height: 'auto', display: 'block' }} />
        </Box>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#b91c1c', fontSize: '0.85rem', lineHeight: 1.2 }}>
          API FOSS TRACKING
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.05)' }} />
      <List sx={{ px: 2, py: 3 }}>
        {menuItems.map((item) => {
          const isSelected = location.pathname === item.path || (item.path === '/apis' && location.pathname.startsWith('/apis/'));
          
          return (
            <ListItem disablePadding key={item.text} sx={{ mb: 1 }}>
              <ListItemButton
                selected={isSelected}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: 2,
                  transition: 'all 0.2s',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                    color: '#dc2626',
                    '& .MuiListItemIcon-root': { color: '#dc2626' },
                  },
                  '&.Mui-selected:hover': {
                    backgroundColor: 'rgba(220, 38, 38, 0.12)',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: isSelected ? '#dc2626' : 'rgba(0,0,0,0.6)' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ 
                    fontWeight: isSelected ? 600 : 500,
                    fontSize: '0.95rem',
                    color: isSelected ? '#dc2626' : 'rgba(0,0,0,0.7)'
                  }} 
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
}
