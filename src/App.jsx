import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import JournalList from './pages/JournalList';
import JournalEntry from './pages/JournalEntry';
import Accounts from './pages/Accounts';
import AnalyticalCenters from './pages/AnalyticalCenters';
import TrialBalance from './pages/TrialBalance';
import FinancialReports from './pages/FinancialReports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Customers from './pages/Customers';
import RealEstate from './pages/RealEstate';
import TaxesRealEstate from './pages/TaxesRealEstate';
import TaxesTotal from './pages/TaxesTotal';
import Partners from './pages/Partners';
import Rentals from './pages/Rentals';
import Ledger from './pages/Ledger';
import Home from './pages/Home';
import Portfolio from './pages/Portfolio';
import Broker from './pages/Broker';
import RvAssets from './pages/RvAssets';
import RvTransactions from './pages/RvTransactions';
import RvMetrics from './pages/RvMetrics';
import { ErrorBoundary } from './components/ErrorBoundary';
import TaxesRv from './pages/TaxesRv';
import CfPortfolio from './pages/CfPortfolio';
import CfEmpresas from './pages/CfEmpresas';
import CfActivos from './pages/CfActivos';

const ProtectedRoute = ({ children }) => {
  const { user, queryUserIds, loading } = useAuth();
  if (loading) return <div className="h-screen bg-background flex items-center justify-center font-display">Cargando...</div>;
  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="journal-list" element={<JournalList />} />
            <Route path="journal-entry" element={<JournalEntry />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="pgc" element={<Accounts />} />
            <Route path="cecos" element={<AnalyticalCenters type="ceco" />} />
            <Route path="cebes" element={<AnalyticalCenters type="cebe" />} />
            <Route path="trial-balance" element={<TrialBalance />} />
            <Route path="reports" element={<FinancialReports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="customers" element={<Customers />} />
            <Route path="real-estate" element={<RealEstate />} />
            <Route path="taxes-real-estate" element={<TaxesRealEstate />} />
            <Route path="taxes-total" element={<TaxesTotal />} />
            <Route path="taxes-rv" element={<TaxesRv />} />
            <Route path="cf-portfolio" element={<CfPortfolio />} />
            <Route path="cf-empresas" element={<CfEmpresas />} />
            <Route path="cf-activos" element={<CfActivos />} />
            <Route path="rentals" element={<Rentals />} />
            <Route path="partners" element={<Partners />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="broker" element={<Broker />} />
            <Route path="rv-assets" element={<RvAssets />} />
            <Route path="rv-transactions" element={<RvTransactions />} />
            <Route path="rv-metrics" element={<RvMetrics />} />
            <Route path="account-statement" element={<Ledger initialMode="detail" />} />
          </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
