import { Routes, Route, Navigate } from 'react-router-dom';
import { getUser } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Debtors from './pages/Debtors.jsx';
import DebtorDetail from './pages/DebtorDetail.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Settings from './pages/Settings.jsx';

import AdminLayout from './admin/AdminLayout.jsx';
import AdminOverview from './admin/AdminOverview.jsx';
import AdminCompanies from './admin/AdminCompanies.jsx';
import AdminCompanyDetail from './admin/AdminCompanyDetail.jsx';

function Private({ children }) {
  return getUser() ? children : <Navigate to="/login" replace />;
}

function SuperAdminOnly({ children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* App principal */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/debtors" element={<Debtors />} />
        <Route path="/debtors/:id" element={<DebtorDetail />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:phone" element={<ClientDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Painel Admin — layout próprio */}
      <Route element={<SuperAdminOnly><AdminLayout /></SuperAdminOnly>}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/companies" element={<AdminCompanies />} />
        <Route path="/admin/companies/:id" element={<AdminCompanyDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
