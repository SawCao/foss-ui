import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import ApiList from './pages/ApiList';
import WeeklyComparison from './pages/WeeklyComparison';
import ApiGraph from './pages/ApiGraph';
import ApiDetails from './pages/ApiDetails';
import BatchSummaries from './pages/BatchSummaries';

import { useEffect } from 'react';
import { useStore } from './store/useStore';

function App() {
  const { loadLatestData } = useStore();

  useEffect(() => {
    loadLatestData();
  }, [loadLatestData]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/apis" replace />} />
          <Route path="apis" element={<ApiList />} />
          <Route path="apis/:id" element={<ApiDetails />} />
          <Route path="comparison" element={<WeeklyComparison />} />
          <Route path="graph" element={<ApiGraph />} />
          <Route path="summaries" element={<BatchSummaries />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
