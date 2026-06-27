import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  BookOpen, 
  Library, 
  Scale, 
  FilePieChart, 
  Settings, 
  LogOut,
  PlusCircle,
  X,
  Download,
  Hash,
  FileText,
  Users,
  Building2,
  Calendar,
  CalendarDays,
  Table,
  Layers,
  BarChart3,
  PieChart,
  Search,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  BarChart,
  Upload,
  FileSpreadsheet,
  TrendingUp,
  Landmark,
  Printer
} from 'lucide-react';
import PunteoModal from './PunteoModal';
import BankReconciliationModal from './BankReconciliationModal';
import SettingsModal from './SettingsModal';

const RibbonCustomIcon = ({ type }) => {
  switch (type) {
    case 'Asientos':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="2" width="18" height="24" fill="white" stroke="#444" strokeWidth="1.2"/>
          <line x1="6" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1"/>
          <text x="8" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">D</text>
          <text x="18" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">H</text>
          <line x1="8" y1="12" x2="22" y2="12" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="15" x2="16" y2="15" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="18" x2="22" y2="18" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="21" x2="14" y2="21" stroke="#aaa" strokeWidth="1"/>
          <path d="M 17 18 L 27 18 M 22 13 L 22 23" stroke="#16a34a" strokeWidth="2.5"/>
        </svg>
      );
    case 'Punteo':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="2" width="18" height="24" fill="white" stroke="#444" strokeWidth="1.2"/>
          <line x1="6" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1"/>
          <text x="8" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">D</text>
          <text x="18" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">H</text>
          <line x1="8" y1="12" x2="22" y2="12" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="15" x2="16" y2="15" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="18" x2="16" y2="18" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="21" x2="14" y2="21" stroke="#aaa" strokeWidth="1"/>
          <rect x="18" y="14" width="10" height="10" fill="white" stroke="#444" strokeWidth="1"/>
          <path d="M 20 19 L 22 21 L 26 16" stroke="#16a34a" strokeWidth="2" fill="none"/>
        </svg>
      );
    case 'Conciliacion':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="2" width="18" height="26" fill="white" stroke="#444" strokeWidth="1.2"/>
          <line x1="6" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1"/>
          <text x="8" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">D</text>
          <text x="18" y="7.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">H</text>
          <line x1="8" y1="12" x2="22" y2="12" stroke="#aaa" strokeWidth="1"/>
          <line x1="8" y1="15" x2="16" y2="15" stroke="#aaa" strokeWidth="1"/>
          <rect x="13" y="14" width="16" height="14" fill="#f8fafc"/>
          <path d="M 13 18 L 21 14 L 29 18" fill="none" stroke="#444" strokeWidth="1.5"/>
          <rect x="16" y="18" width="2" height="6" fill="none" stroke="#f59e0b" strokeWidth="1"/>
          <rect x="20" y="18" width="2" height="6" fill="none" stroke="#f59e0b" strokeWidth="1"/>
          <rect x="24" y="18" width="2" height="6" fill="none" stroke="#f59e0b" strokeWidth="1"/>
          <line x1="13" y1="24" x2="29" y2="24" stroke="#444" strokeWidth="1.5"/>
          <line x1="12" y1="26" x2="30" y2="26" stroke="#444" strokeWidth="1.5"/>
        </svg>
      );
      case 'BalanceSumas':
        return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 12 24 L 20 24 L 22 26 L 10 26 Z" fill="#d4d4d4" stroke="#444" strokeWidth="1.2" strokeLinejoin="round"/>
            <line x1="16" y1="24" x2="16" y2="6" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M 16 6.5 L 17.5 8 L 16 9.5 L 14.5 8 Z" fill="none" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="4" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="8" y1="9" x2="12" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="20" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="28" y2="17" stroke="#444" strokeWidth="1"/>
            <path d="M 3 17 L 13 17 C 13 22 3 22 3 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M 19 17 L 29 17 C 29 22 19 22 19 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        );
      case 'SaldosMensuales':
        return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 12 24 L 20 24 L 22 26 L 10 26 Z" fill="#d4d4d4" stroke="#444" strokeWidth="1.2" strokeLinejoin="round"/>
            <line x1="16" y1="24" x2="16" y2="6" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M 16 6.5 L 17.5 8 L 16 9.5 L 14.5 8 Z" fill="none" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="4" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="8" y1="9" x2="12" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="20" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="28" y2="17" stroke="#444" strokeWidth="1"/>
            <path d="M 3 17 L 13 17 C 13 22 3 22 3 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M 19 17 L 29 17 C 29 22 19 22 19 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>
            
            <rect x="14" y="12" width="16" height="12" fill="white" rx="1"/>
            <rect x="14" y="12" width="16" height="12" fill="white" stroke="#444" strokeWidth="1.2" rx="1"/>
            <path d="M 14 13 C 14 12.4 14.4 12 15 12 L 29 12 C 29.6 12 30 12.4 30 13 L 30 15 L 14 15 Z" fill="#bbf7d0" stroke="#444" strokeWidth="1.2"/>
            <line x1="17" y1="11" x2="17" y2="13" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="27" y1="11" x2="27" y2="13" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
            <rect x="15.5" y="17" width="3.5" height="2" fill="#d4d4d4"/>
            <rect x="20.5" y="17" width="3.5" height="2" fill="#d4d4d4"/>
            <rect x="25.5" y="17" width="3.5" height="2" fill="#d4d4d4"/>
            <rect x="15.5" y="20" width="3.5" height="2" fill="#d4d4d4"/>
            <rect x="20.5" y="20" width="3.5" height="2" fill="#d4d4d4"/>
          </svg>
        );
      case 'SaldosColumnas':
        return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 12 24 L 20 24 L 22 26 L 10 26 Z" fill="#d4d4d4" stroke="#444" strokeWidth="1.2" strokeLinejoin="round"/>
            <line x1="16" y1="24" x2="16" y2="6" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="24" y2="9" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M 16 6.5 L 17.5 8 L 16 9.5 L 14.5 8 Z" fill="none" stroke="#444" strokeWidth="1.2"/>
            <line x1="8" y1="9" x2="4" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="8" y1="9" x2="12" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="20" y2="17" stroke="#444" strokeWidth="1"/>
            <line x1="24" y1="9" x2="28" y2="17" stroke="#444" strokeWidth="1"/>
            <path d="M 3 17 L 13 17 C 13 22 3 22 3 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M 19 17 L 29 17 C 29 22 19 22 19 17 Z" fill="#fde08b" stroke="#ea580c" strokeWidth="1.2" strokeLinejoin="round"/>

            <rect x="14" y="12" width="16" height="13" fill="white" stroke="#444" strokeWidth="1.2"/>
            <rect x="14.6" y="12.6" width="14.8" height="3" fill="#ea580c"/>
            <line x1="14" y1="15.6" x2="30" y2="15.6" stroke="#444" strokeWidth="1.2"/>
            <line x1="14" y1="19" x2="30" y2="19" stroke="#444" strokeWidth="1"/>
            <line x1="14" y1="22" x2="30" y2="22" stroke="#444" strokeWidth="1"/>
            <line x1="16" y1="17.3" x2="18" y2="17.3" stroke="#444" strokeWidth="1"/>
            <line x1="20" y1="17.3" x2="28" y2="17.3" stroke="#444" strokeWidth="1" strokeDasharray="1 2"/>
            <line x1="16" y1="20.5" x2="18" y2="20.5" stroke="#444" strokeWidth="1"/>
            <line x1="20" y1="20.5" x2="28" y2="20.5" stroke="#444" strokeWidth="1" strokeDasharray="1 2"/>
            <line x1="16" y1="23.5" x2="18" y2="23.5" stroke="#444" strokeWidth="1"/>
            <line x1="20" y1="23.5" x2="28" y2="23.5" stroke="#444" strokeWidth="1" strokeDasharray="1 2"/>
          </svg>
        );
      case 'AsientosDescuadrados':
        return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="3" width="16" height="24" fill="white" stroke="#444" strokeWidth="1.2"/>
            <text x="8" y="11" fill="#444" fontSize="8" fontFamily="sans-serif" fontWeight="bold">D</text>
            <text x="15" y="11" fill="#444" fontSize="8" fontFamily="sans-serif" fontWeight="bold">H</text>
            <line x1="8" y1="14" x2="20" y2="14" stroke="#999" strokeWidth="1.2"/>
            <line x1="8" y1="17" x2="14" y2="17" stroke="#999" strokeWidth="1.2"/>
            <line x1="8" y1="20" x2="14" y2="20" stroke="#dc2626" strokeWidth="1.5"/>
            <line x1="8" y1="23" x2="14" y2="23" stroke="#dc2626" strokeWidth="1.5"/>
            <line x1="8" y1="26" x2="14" y2="26" stroke="#dc2626" strokeWidth="1.5"/>
            <circle cx="21" cy="20" r="4.5" fill="white" stroke="#444" strokeWidth="1.5"/>
            <line x1="24" y1="23" x2="28" y2="27" stroke="#444" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        );
    case 'DiarioMov':
    case 'ExtractoMov':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="4" width="20" height="20" fill="white" stroke="#444" strokeWidth="1.2"/>
          <rect x="7" y="5" width="18" height="18" fill="none" stroke="#0ea5e9" strokeWidth="1"/>
          <line x1="7" y1="11" x2="25" y2="11" stroke="#444" strokeWidth="1"/>
          <text x="10" y="9.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">D</text>
          <text x="20" y="9.5" fill="#222" fontSize="6" fontFamily="sans-serif" fontWeight="bold">H</text>
          <line x1="9" y1="14" x2="23" y2="14" stroke="#aaa" strokeWidth="1"/>
          <line x1="9" y1="17" x2="16" y2="17" stroke="#aaa" strokeWidth="1"/>
          <line x1="18" y1="17" x2="23" y2="17" stroke="#aaa" strokeWidth="1"/>
          <line x1="9" y1="20" x2="23" y2="20" stroke="#aaa" strokeWidth="1"/>
          <line x1="10" y1="26" x2="22" y2="26" stroke="#444" strokeWidth="1"/>
        </svg>
      );
    case 'PGC':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="6" width="12" height="8" fill="white" stroke="#333" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="16" y2="18" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="8" y1="18" x2="24" y2="18" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="8" y1="18" x2="8" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="16" y1="18" x2="16" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="24" y1="18" x2="24" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <rect x="5" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
          <rect x="13" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
          <rect x="21" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
        </svg>
      );
    case 'ConfigCuentas':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* PGC Base */}
          <rect x="10" y="6" width="12" height="8" fill="white" stroke="#333" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="16" y2="18" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="8" y1="18" x2="24" y2="18" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="8" y1="18" x2="8" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="16" y1="18" x2="16" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="24" y1="18" x2="24" y2="21" stroke="#0ea5e9" strokeWidth="1.5"/>
          <rect x="5" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
          <rect x="13" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
          <rect x="21" y="21" width="6" height="6" fill="white" stroke="#333" strokeWidth="1.5"/>
          
          {/* Gear overlay bottom right */}
          <g transform="translate(19, 19) scale(0.55)">
            <circle cx="12" cy="12" r="10" fill="white" />
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" fill="#5c6bc0" />
            <circle cx="12" cy="12" r="3.5" fill="white" />
          </g>
        </svg>
      );
    case 'Nuevo':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 2 L 20 2 L 26 8 L 26 26 L 8 26 Z" fill="white" stroke="#444" strokeWidth="1.5"/>
          <path d="M 20 2 L 20 8 L 26 8" fill="white" stroke="#444" strokeWidth="1.5"/>
          <path d="M 17 21 L 27 21 M 22 16 L 22 26" stroke="#16a34a" strokeWidth="2.5"/>
        </svg>
      );
    case 'Modificar':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 2 L 20 2 L 26 8 L 26 26 L 8 26 Z" fill="white" stroke="#444" strokeWidth="1.5"/>
          <path d="M 20 2 L 20 8 L 26 8" fill="white" stroke="#444" strokeWidth="1.5"/>
          <line x1="11" y1="12" x2="23" y2="12" stroke="#aaa" strokeWidth="1"/>
          <line x1="11" y1="16" x2="23" y2="16" stroke="#aaa" strokeWidth="1"/>
          <line x1="11" y1="20" x2="16" y2="20" stroke="#aaa" strokeWidth="1"/>
          <path d="M 17 24 L 15 26 L 17 28 L 26 19 L 24 17 Z" fill="white" stroke="#0ea5e9" strokeWidth="1.5"/>
          <path d="M 26 19 L 28 17 L 26 15 L 24 17" fill="#0ea5e9" stroke="#0ea5e9" strokeWidth="1"/>
          <line x1="16.5" y1="25.5" x2="15" y2="26" stroke="#0ea5e9" strokeWidth="1.5"/>
        </svg>
      );
    case 'Eliminar':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 2 L 20 2 L 26 8 L 26 26 L 8 26 Z" fill="white" stroke="#444" strokeWidth="1.5"/>
          <path d="M 20 2 L 20 8 L 26 8" fill="white" stroke="#444" strokeWidth="1.5"/>
          <line x1="11" y1="12" x2="23" y2="12" stroke="#aaa" strokeWidth="1"/>
          <line x1="11" y1="16" x2="23" y2="16" stroke="#aaa" strokeWidth="1"/>
          <line x1="11" y1="20" x2="16" y2="20" stroke="#aaa" strokeWidth="1"/>
          <path d="M 18 19 L 26 27 M 18 27 L 26 19" stroke="#ef4444" strokeWidth="3"/>
        </svg>
      );
    case 'Filtrar':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="7" y="8" width="18" height="16" rx="2" fill="none" stroke="#64748b" strokeWidth="2"/>
          <line x1="13" y1="8" x2="13" y2="24" stroke="#64748b" strokeWidth="2"/>
        </svg>
      );
    case 'Exportar':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 6 L 24 6 L 24 26 L 8 26 Z" fill="#e2e8f0" stroke="#444" strokeWidth="1.5"/>
          <path d="M 8 10 L 24 10" stroke="#444" strokeWidth="1.5"/>
          <path d="M 8 14 L 24 14" stroke="#444" strokeWidth="1.5"/>
          <path d="M 12 6 L 12 26" stroke="#444" strokeWidth="1.5"/>
          <text x="13.5" y="24" fill="#16a34a" fontSize="11" fontFamily="sans-serif" fontWeight="bold">X</text>
        </svg>
      );
    case 'AddColumn':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6 10 L 26 10 L 26 26 L 6 26 Z" fill="#e2e8f0" stroke="#444" strokeWidth="1.5"/>
          <path d="M 6 14 L 26 14" stroke="#444" strokeWidth="1.5"/>
          <path d="M 6 18 L 26 18" stroke="#444" strokeWidth="1.5"/>
          <path d="M 12 10 L 12 26" stroke="#444" strokeWidth="1.5"/>
          <path d="M 20 10 L 20 26" stroke="#444" strokeWidth="1.5"/>
          <circle cx="9" cy="7" r="4" fill="#fbbf24" stroke="#d97706" strokeWidth="1"/>
          <path d="M 9 4 L 9 2 M 9 12 L 9 10 M 4 7 L 2 7 M 14 7 L 16 7 M 5.5 3.5 L 4 2 M 12.5 10.5 L 14 12 M 12.5 3.5 L 14 2 M 5.5 10.5 L 4 12" stroke="#d97706" strokeWidth="1"/>
        </svg>
      );
    default:
      return <div className="w-8 h-8 bg-gray-200"></div>;
  }
};

export default function Layout() {
  const { user, queryUserIds, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [realEstates, setRealEstates] = useState([]);
  const [rvAssets, setRvAssets] = useState([]);
  const [rvBrokers, setRvBrokers] = useState([]);
  const [cfProjects, setCfProjects] = useState([]);
  const [cfPlatforms, setCfPlatforms] = useState([]);

  useEffect(() => {
    if (user?.uid) {
      const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

      const fetchRealEstates = async () => {
        try {
          const q = query(collection(db, 'properties'), where('userId', 'in', targetUserIds));
          const snapshot = await getDocs(q);
          setRealEstates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching real estates:", error);
        }
      };

      const fetchRvData = async () => {
        try {
          const qAssets = query(collection(db, 'rv_assets'), where('userId', 'in', targetUserIds));
          const snapAssets = await getDocs(qAssets);
          setRvAssets(snapAssets.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          const qBrokers = query(collection(db, 'rv_brokers'), where('userId', 'in', targetUserIds));
          const snapBrokers = await getDocs(qBrokers);
          setRvBrokers(snapBrokers.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching Renta Variable data in layout:", error);
        }
      };

      const fetchCfData = async () => {
        try {
          const qProjects = query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds));
          const snapProjects = await getDocs(qProjects);
          setCfProjects(snapProjects.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          const qPlatforms = query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds));
          const snapPlatforms = await getDocs(qPlatforms);
          setCfPlatforms(snapPlatforms.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching Crowdfunding data in layout:", error);
        }
      };

      fetchRealEstates();
      fetchRvData();
      fetchCfData();
    }
  }, [user, queryUserIds]);

  const [activeModule, setActiveModule] = useState('Módulos');
  const [activeTab, setActiveTab] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showRibbon, setShowRibbon] = useState(true);
  const [dropdownConfig, setDropdownConfig] = useState(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [activeColumns, setActiveColumns] = useState({});
  const [tableZoom, setTableZoom] = useState(1);

  useEffect(() => {
    document.documentElement.style.setProperty('--table-zoom', tableZoom);
  }, [tableZoom]);
  const [showPunteoModal, setShowPunteoModal] = useState(false);
  const [showBankReconciliationModal, setShowBankReconciliationModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleSync = (e) => setActiveColumns(prev => ({ ...prev, [e.detail.tab]: e.detail.columns }));
    window.addEventListener('sync-columns', handleSync);
    
    const openPunteo = () => setShowPunteoModal(true);
    window.addEventListener('punteo:open', openPunteo);
    
    const openBankReconciliation = () => setShowBankReconciliationModal(true);
    window.addEventListener('bank-reconciliation:open', openBankReconciliation);
    
    const handleModuleSelect = (e) => {
      const modName = e.detail;
      setActiveModule(modName);
      const firstTab = moduleTabs[modName]?.[0];
      if (firstTab) {
        setActiveTab(firstTab);
        navigate(tabDefaultPaths[firstTab] || '#');
        setShowRibbon(true);
      }
    };
    window.addEventListener('module:select', handleModuleSelect);
    
    const closeDropdowns = () => {
      setDropdownConfig(null);
    };
    window.addEventListener('mousedown', closeDropdowns);
    window.addEventListener('real-estate:new', closeDropdowns);
    window.addEventListener('real-estate:edit', closeDropdowns);
    window.addEventListener('customers:new', closeDropdowns);
    window.addEventListener('customers:edit', closeDropdowns);
    window.addEventListener('rentals:new', closeDropdowns);
    window.addEventListener('rentals:edit', closeDropdowns);
    window.addEventListener('partners:new', closeDropdowns);
    window.addEventListener('partners:edit', closeDropdowns);
    window.addEventListener('rv-transaction:new', closeDropdowns);
    window.addEventListener('rv-transaction:edit', closeDropdowns);
    window.addEventListener('rv-broker:new', closeDropdowns);
    window.addEventListener('rv-broker:edit', closeDropdowns);
    window.addEventListener('rv-asset:new', closeDropdowns);
    window.addEventListener('rv-asset:edit', closeDropdowns);

    return () => {
      window.removeEventListener('sync-columns', handleSync);
      window.removeEventListener('punteo:open', openPunteo);
      window.removeEventListener('bank-reconciliation:open', openBankReconciliation);
      window.removeEventListener('module:select', handleModuleSelect);
      window.removeEventListener('mousedown', closeDropdowns);
      window.removeEventListener('real-estate:new', closeDropdowns);
      window.removeEventListener('real-estate:edit', closeDropdowns);
      window.removeEventListener('customers:new', closeDropdowns);
      window.removeEventListener('customers:edit', closeDropdowns);
      window.removeEventListener('rentals:new', closeDropdowns);
      window.removeEventListener('rentals:edit', closeDropdowns);
      window.removeEventListener('partners:new', closeDropdowns);
      window.removeEventListener('partners:edit', closeDropdowns);
      window.removeEventListener('rv-transaction:new', closeDropdowns);
      window.removeEventListener('rv-transaction:edit', closeDropdowns);
      window.removeEventListener('rv-broker:new', closeDropdowns);
      window.removeEventListener('rv-broker:edit', closeDropdowns);
      window.removeEventListener('rv-asset:new', closeDropdowns);
      window.removeEventListener('rv-asset:edit', closeDropdowns);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('request-sync-columns'));
  }, []);

  useEffect(() => {
    const currentPath = location.pathname;
    let foundTab = '';
    let foundModule = '';
    
    for (const [tab, path] of Object.entries(tabDefaultPaths)) {
      if (currentPath === path) {
        foundTab = tab;
        break;
      }
    }
    
    if (foundTab) {
      for (const [mod, tabs] of Object.entries(moduleTabs)) {
        if (tabs.includes(foundTab)) {
          foundModule = mod;
          break;
        }
      }
    }
    
    if (foundTab) {
      setActiveTab(foundTab);
      if (foundModule) setActiveModule(foundModule);
    }
  }, [location.pathname]);

  const availableColumnsByTab = {
    'Clientes': [
      { group: 'GENERAL', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre' },
        { id: 'dni', name: 'DNI / NIF' },
        { id: 'status', name: 'Estado' }
      ]},
      { group: 'CONTACTO', items: [
        { id: 'phone', name: 'Teléfono' },
        { id: 'email', name: 'Email' },
        { id: 'address', name: 'Dirección' },
        { id: 'city', name: 'Población' },
        { id: 'cp', name: 'CP' }
      ]},
      { group: 'OTROS', items: [
        { id: 'notes', name: 'Notas' }
      ]}
    ],
    'Activos': [
      { group: 'DATOS', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre de la Finca' },
        { id: 'address', name: 'Dirección' },
        { id: 'country', name: 'País' },
        { id: 'region', name: 'Región/Provincia' },
        { id: 'city', name: 'Población' },
        { id: 'cp', name: 'Código Postal' },
        { id: 'catastral', name: 'Ref. Catastral' },
        { id: 'registry', name: 'Reg. Propiedad' },
        { id: 'accountNumber', name: 'Número de cuenta' },
        { id: 'accountingAccount', name: 'Cuenta contable asociada' },
        { id: 'cebe', name: 'CEBE Asociado' },
        { id: 'ceco', name: 'CECO Asociado' }
      ]},
      { group: 'ALQUILER (RESUMEN)', items: [
        { id: 'tenantDisplay', name: 'Inquilino Actual' },
        { id: 'rentTotal', name: 'Renta Mensual Total' }
      ]},
      { group: 'HIPOTECA', items: [
        { id: 'bank', name: 'Entidad Bancaria' },
        { id: 'loanNumber', name: 'Nº Préstamo' },
        { id: 'loanAmount', name: 'Importe Concedido' },
        { id: 'mortgagePending', name: 'Hipoteca Pendiente' },
        { id: 'interest', name: 'Tipo Interés' },
        { id: 'expiry', name: 'Fecha Vencimiento' }
      ]},
      { group: 'COMUNIDAD', items: [
        { id: 'communityAdmin', name: 'Administrador' },
        { id: 'communityAdminEmail', name: 'Email Admin' },
        { id: 'communityAdminPhone', name: 'Tel. Administrador' },
        { id: 'communityFee', name: 'Cuota Mensual' },
        { id: 'communityPaymentDay', name: 'Día Cobro' }
      ]},
      { group: 'FINANZAS', items: [
        { id: 'finAcquisitionDate', name: 'Fecha Adquisición' },
        { id: 'finPurchasePrice', name: 'Precio Compra' },
        { id: 'finAcquisitionCosts', name: 'Gastos Adquisición' },
        { id: 'finAgentFees', name: 'Honorarios Agencia' },
        { id: 'finCurrentValue', name: 'Valor Actual' },
        { id: 'finSalePrice', name: 'Precio Venta Esperado' }
      ]}
    ],
    'Alquileres': [
      { group: 'CONTRATO', items: [
        { id: 'id', name: 'ID' },
        { id: 'reference', name: 'Referencia' },
        { id: 'propertyDisplay', name: 'Activo' },
        { id: 'tenantDisplay', name: 'Inquilino' },
        { id: 'rentalType', name: 'Tipo de Alquiler' },
        { id: 'duration', name: 'Duración' },
        { id: 'startDate', name: 'Inicio Contrato' },
        { id: 'endDate', name: 'Fin Contrato' },
        { id: 'status', name: 'Estado' }
      ]},
      { group: 'ECONÓMICO', items: [
        { id: 'deposit', name: 'Fianza' },
        { id: 'rent', name: 'Renta' },
        { id: 'paymentMethod', name: 'Forma de Pago' },
        { id: 'actualizaIpc', name: 'Actualiza IPC' }
      ]}
    ],
    'Propietarios': [
      { group: 'GENERAL', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre' },
        { id: 'dni', name: 'DNI / NIF' },
        { id: 'status', name: 'Estado' }
      ]},
      { group: 'CONTACTO', items: [
        { id: 'phone', name: 'Teléfono' },
        { id: 'email', name: 'Email' },
        { id: 'address', name: 'Dirección' }
      ]},
      { group: 'FINANCIERO', items: [
        { id: 'iban', name: 'IBAN' },
        { id: 'ownership', name: '% Propiedad' }
      ]}
    ],
    'Total': [
      { group: 'DATOS FISCALES', items: [
        { id: 'year', name: 'Año' },
        { id: 'ingresos', name: 'Ingresos' },
        { id: 'gastos', name: 'Gastos' },
        { id: 'amortizacion', name: 'Amortización' },
        { id: 'beneficioNeto', name: 'Rendimiento Neto' }
      ]}
    ],
    'Inversiones inmobiliarias': [
      { group: 'DATOS FISCALES', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre del Activo' },
        { id: 'ingresos', name: 'Ingresos' },
        { id: 'gastos', name: 'Gastos' },
        { id: 'amortizacion', name: 'Amortización' },
        { id: 'beneficioNeto', name: 'Rendimiento Neto' }
      ]}
    ],
    'Portfolio': [
      { group: 'DATOS', items: [
        { id: 'symbol', name: 'Ticker' },
        { id: 'name', name: 'Nombre' },
        { id: 'type', name: 'Tipo de Activo' },
        { id: 'brokerName', name: 'Broker' },
        { id: 'quantity', name: 'Cantidad' },
        { id: 'pmc', name: 'PMC' },
        { id: 'currentPrice', name: 'Precio Actual' },
        { id: 'totalCost', name: 'Coste Total' },
        { id: 'currentValue', name: 'Valor Actual' },
        { id: 'pnl', name: 'Rendimiento (€)' },
        { id: 'pnlPercent', name: 'Rendimiento (%)' }
      ]}
    ],
    'Broker': [
      { group: 'DATOS BROKER', items: [
        { id: 'id', name: 'ID Broker' },
        { id: 'name', name: 'Nombre Broker' },
        { id: 'accountNumber', name: 'Número de cuenta' },
        { id: 'currency', name: 'Tipo de divisa' },
        { id: 'status', name: 'Estado' }
      ]}
    ],
    'Activos RV': [
      { group: 'DATOS ACTIVO', items: [
        { id: 'id', name: 'Ticker / Símbolo' },
        { id: 'name', name: 'Nombre' },
        { id: 'type', name: 'Tipo de activo' },
        { id: 'sector', name: 'Sector' },
        { id: 'currency', name: 'Divisa histórico' },
        { id: 'apiSource', name: 'Origen API' }
      ]}
    ],
    'Transacciones': [
      { group: 'DATOS TRANSACCIÓN', items: [
        { id: 'id', name: 'ID Transacción' },
        { id: 'date', name: 'Fecha' },
        { id: 'assetId', name: 'Activo (Ticker)' },
        { id: 'brokerName', name: 'Broker' },
        { id: 'type', name: 'Tipo Operación' },
        { id: 'quantity', name: 'Cantidad (Títulos)' },
        { id: 'price', name: 'Precio Unitario' },
        { id: 'fee', name: 'Comisiones' },
        { id: 'exchangeRate', name: 'Tipo Cambio' },
        { id: 'currency', name: 'Divisa' },
        { id: 'totalAmount', name: 'Total' }
      ]}
    ],
    'Plataforma': [
      { group: 'DATOS PLATAFORMA', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre' },
        { id: 'type', name: 'Tipo' },
        { id: 'country', name: 'País' },
        { id: 'bankAccount', name: 'Cuenta corriente' },
        { id: 'ceco', name: 'CECO' },
        { id: 'cebe', name: 'CEBE' },
        { id: 'currency', name: 'Divisa' },
        { id: 'status', name: 'Estado' }
      ]}
    ],
    'CF Activos': [
      { group: 'DATOS ACTIVO', items: [
        { id: 'id', name: 'ID' },
        { id: 'name', name: 'Nombre' },
        { id: 'platformName', name: 'Plataforma' },
        { id: 'type', name: 'Tipo' },
        { id: 'targetAmount', name: 'Objetivo' },
        { id: 'annualRate', name: 'Tasa anual (%)' },
        { id: 'term', name: 'Plazo (m)' },
        { id: 'status', name: 'Estado' }
      ]}
    ],
    'Transacciones CF': [
      { group: 'DATOS TRANSACCIÓN', items: [
        { id: 'id', name: 'ID' },
        { id: 'date', name: 'Fecha' },
        { id: 'projectName', name: 'Proyecto' },
        { id: 'platformName', name: 'Plataforma' },
        { id: 'type', name: 'Tipo' },
        { id: 'amount', name: 'Importe' },
        { id: 'notes', name: 'Notas' }
      ]}
    ],
    'CF Portfolio': [
      { group: 'DATOS DE CARTERA', items: [
        { id: 'groupName', name: 'Activo / Plataforma' },
        { id: 'investment', name: 'Inversión' },
        { id: 'grossRents', name: 'Rentas Brutas' },
        { id: 'expenses', name: 'Gastos' },
        { id: 'netRents', name: 'Rentas Netas' },
        { id: 'totalGross', name: 'Importe Total' },
        { id: 'totalNet', name: 'Imp. Total Neto' },
        { id: 'yieldGross', name: 'Rent. Bruta' },
        { id: 'yieldNet', name: 'Rent. Neta' }
      ]}
    ]
  };

  const modules = [
    'Contabilidad',
    'Inversiones inmobiliarias',
    'Renta variable',
    'Crowdfunding',
    'Impuestos',
    'Informes',
    'Herramientas',
    'Ayuda'
  ];

  const moduleTabs = {
    'Contabilidad': ['Cuentas contables', 'Diario', 'Mayor', 'Sumas y saldos'],
    'Inversiones inmobiliarias': ['Activos', 'Propietarios', 'Clientes', 'Alquileres'],
    'Renta variable': ['Portfolio', 'Broker', 'Activos RV', 'Transacciones', 'Métricas RV'],
    'Crowdfunding': ['CF Portfolio', 'Plataforma', 'CF Activos', 'Transacciones CF'],
    'Informes': ['Reportes', 'Dashboard', 'Impresion'],
    'Impuestos': ['Total', 'Inversiones inmobiliarias', 'Renta variable', 'Crowdfunding'],
    'Herramientas': ['Importador'],
    'Ayuda': ['Manual', 'Soporte']
  };

  const tabDefaultPaths = {
    'Cuentas contables': '/accounts',
    'Diario': '/journal-entry',
    'Mayor': '/account-statement',
    'Sumas y saldos': '/trial-balance',
    'Clientes': '/customers',
    'Activos': '/real-estate',
    'Alquileres': '/rentals',
    'Propietarios': '/partners',
    'Portfolio': '/portfolio',
    'Broker': '/broker',
    'Activos RV': '/rv-assets',
    'Transacciones': '/rv-transactions',
    'Métricas RV': '/rv-metrics',
    'CF Portfolio': '/cf-portfolio',
    'Plataforma': '/cf-empresas',
    'CF Activos': '/cf-activos',
    'Transacciones CF': '/cf-transactions',
    'Reportes': '/reports',
    'Dashboard': '/dashboard',
    'Impresion': '/print',
    'Total': '/taxes-total',
    'Inversiones inmobiliarias': '/taxes-real-estate',
    'Renta variable': '/taxes-rv',
    'Crowdfunding': '/taxes-cf',
    'Importador': '/importador',
    'Manual': '#',
    'Soporte': '#'
  };

  const tabRibbons = {
    'Cuentas contables': [
      { 
        group: 'Cuentas', 
        items: [
          { name: 'Configuración\nde cuentas', path: '/accounts', customIcon: 'ConfigCuentas' },
          { name: 'P.G.C.', path: '/pgc', customIcon: 'PGC' }
        ] 
      },
      {
        group: 'Analítica',
        items: [
          { name: 'CECOS', path: '/cecos', icon: LayoutGrid },
          { name: 'CEBES', path: '/cebes', icon: BarChart }
        ]
      }
    ],
    'Diario': [
      {
        group: 'Diario',
        items: [
          { name: 'Introducción\nde asientos', path: '/journal-entry', customIcon: 'Asientos' },
          { name: 'Punteo', action: 'punteo:open', customIcon: 'Punteo' },
          { name: 'Conciliación\nbancaria', action: 'bank-reconciliation:open', customIcon: 'Conciliacion' }
        ]
      },
      {
        group: 'Consultas',
        items: [
          { name: 'Diario de\nmovimientos', path: '/journal-list', customIcon: 'DiarioMov' }
        ]
      }
    ],
    'Mayor': [
      { 
        group: 'Mayor', 
        items: [
          { name: 'Extracto de\nmovimientos', path: '/account-statement', customIcon: 'ExtractoMov' }
        ] 
      }
    ],
    'Sumas y saldos': [
      { 
        group: 'Consultas', 
        items: [
          { name: 'Balance de\nsumas y saldos', path: '/trial-balance', customIcon: 'BalanceSumas' },
          { name: 'Saldos\nmensuales', action: 'trial-balance:mensuales', customIcon: 'SaldosMensuales' },
          { name: 'Saldos por\ncolumnas', action: 'trial-balance:columnas', customIcon: 'SaldosColumnas' },
          { name: 'Asientos\ndescuadrados', action: 'trial-balance:descuadrados', customIcon: 'AsientosDescuadrados' }
        ]
      }
    ],
    'Clientes': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'customer:new', path: '/customers', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'customer:edit', path: '/customers', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'customer:delete', path: '/customers', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'customer:columns', path: '/customers', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'customer:export', path: '/customers', customIcon: 'Exportar' }
        ]
      }
    ],
    'Total': [
      {
        group: 'Impuestos',
        items: [
          { name: `Fecha\n(${taxYear})`, action: 'taxes:year-dropdown', icon: Calendar }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'taxes-total:columns', path: '/taxes-total', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'taxes-total:export', path: '/taxes-total', customIcon: 'Exportar' }
        ]
      }
    ],
    'Inversiones inmobiliarias': [
      {
        group: 'Impuestos',
        items: [
          { name: `Fecha\n(${taxYear})`, action: 'taxes:year-dropdown', icon: Calendar },
          { name: 'Extracto', action: 'taxes:extract', icon: FileText }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'taxes-re:columns', path: '/taxes-real-estate', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'taxes-re:export', path: '/taxes-real-estate', customIcon: 'Exportar' }
        ]
      }
    ],
    'Renta variable': [
      {
        group: 'Impuestos',
        items: [
          { name: `Fecha\n(${taxYear})`, action: 'taxes:year-dropdown', icon: Calendar }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Exportar', action: 'taxes-rv:export', path: '/taxes-rv', customIcon: 'Exportar' }
        ]
      }
    ],
    'Crowdfunding': [
      {
        group: 'Impuestos',
        items: [
          { name: `Fecha\n(${taxYear})`, action: 'taxes:year-dropdown', icon: Calendar }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Exportar', action: 'taxes-cf:export', path: '/taxes-cf', customIcon: 'Exportar' }
        ]
      }
    ],
    'Activos': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'real-estate:new', path: '/real-estate', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'real-estate:edit', path: '/real-estate', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'real-estate:delete', path: '/real-estate', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'real-estate:columns', path: '/real-estate', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'real-estate:export', path: '/real-estate', customIcon: 'Exportar' }
        ]
      }
    ],
    'Alquileres': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'rentals:new', path: '/rentals', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'rentals:edit', path: '/rentals', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'rentals:delete', path: '/rentals', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'rentals:columns', path: '/rentals', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'rentals:export', path: '/rentals', customIcon: 'Exportar' }
        ]
      }
    ],
    'Propietarios': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'partners:new', path: '/partners', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'partners:edit', path: '/partners', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'partners:delete', path: '/partners', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'partner:columns', path: '/partners', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'partner:export', path: '/partners', customIcon: 'Exportar' }
        ]
      }
    ],
    'Portfolio': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nueva\ntransacción', action: 'rv-transaction:new', path: '/portfolio', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'rv-transaction:edit', path: '/portfolio', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'rv-transaction:delete', path: '/portfolio', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'portfolio:columns', path: '/portfolio', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'portfolio:export', path: '/portfolio', customIcon: 'Exportar' }
        ]
      }
    ],
    'Broker': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'rv-broker:new', path: '/broker', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'rv-broker:edit', path: '/broker', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'rv-broker:delete', path: '/broker', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'rv-broker:columns', path: '/broker', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'rv-broker:export', path: '/broker', customIcon: 'Exportar' }
        ]
      }
    ],
    'Activos RV': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'rv-asset:new', path: '/rv-assets', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'rv-asset:edit', path: '/rv-assets', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'rv-asset:delete', path: '/rv-assets', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'rv-asset:columns', path: '/rv-assets', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'rv-asset:export', path: '/rv-assets', customIcon: 'Exportar' }
        ]
      }
    ],
    'Transacciones': [
      { 
        group: 'Mantenimiento', 
        items: [
          { name: 'Nuevo', action: 'rv-transaction:new', path: '/rv-transactions', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'rv-transaction:edit', path: '/rv-transactions', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'rv-transaction:delete', path: '/rv-transactions', customIcon: 'Eliminar' }
        ] 
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'rv-transaction:columns', path: '/rv-transactions', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'rv-transaction:export', path: '/rv-transactions', customIcon: 'Exportar' }
        ]
      }
    ],
    'Métricas RV': [
      {
        group: 'Métricas',
        items: [
          { name: 'Calcular\nmétricas', action: 'rv-metrics:calculate', icon: BarChart3 },
          { name: 'Exportar', action: 'rv-metrics:export', customIcon: 'Exportar' }
        ]
      }
    ],
    'CF Portfolio': [
      {
        group: 'Mantenimiento',
        items: [
          { name: 'Nuevo', action: 'cf-portfolio:new', path: '/cf-portfolio', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'cf-portfolio:edit', path: '/cf-portfolio', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'cf-portfolio:delete', path: '/cf-portfolio', customIcon: 'Eliminar' }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'cf-portfolio:columns', path: '/cf-portfolio', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'cf-portfolio:export', path: '/cf-portfolio', customIcon: 'Exportar' }
        ]
      }
    ],
    'Plataforma': [
      {
        group: 'Mantenimiento',
        items: [
          { name: 'Nuevo', action: 'cf-empresa:new', path: '/cf-empresas', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'cf-empresa:edit', path: '/cf-empresas', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'cf-empresa:delete', path: '/cf-empresas', customIcon: 'Eliminar' }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'cf-empresa:columns', path: '/cf-empresas', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'cf-empresa:export', path: '/cf-empresas', customIcon: 'Exportar' }
        ]
      }
    ],
    'CF Activos': [
      {
        group: 'Mantenimiento',
        items: [
          { name: 'Nuevo', action: 'cf-activo:new', path: '/cf-activos', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'cf-activo:edit', path: '/cf-activos', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'cf-activo:delete', path: '/cf-activos', customIcon: 'Eliminar' }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'cf-activo:columns', path: '/cf-activos', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'cf-activo:export', path: '/cf-activos', customIcon: 'Exportar' }
        ]
      }
    ],
    'Transacciones CF': [
      {
        group: 'Mantenimiento',
        items: [
          { name: 'Nuevo', action: 'cf-transactions-new', path: '/cf-transactions', customIcon: 'Nuevo' },
          { name: 'Modificar', action: 'cf-transactions-edit', path: '/cf-transactions', customIcon: 'Modificar' },
          { name: 'Eliminar', action: 'cf-transactions-delete', path: '/cf-transactions', customIcon: 'Eliminar' }
        ]
      },
      {
        group: 'Acciones',
        items: [
          { name: 'Añadir columna', action: 'cf-transactions-columns', path: '/cf-transactions', customIcon: 'AddColumn' },
          { name: 'Exportar', action: 'cf-transactions-export', path: '/cf-transactions', customIcon: 'Exportar' }
        ]
      }
    ],
    'Reportes': [
      { 
        group: 'Reportes', 
        items: [
          { name: 'Contabilidad', action: 'reports:contabilidad', icon: BookOpen },
          { name: 'Inversiones\ninmobiliarias', path: '/taxes-real-estate', icon: Building2 },
          { name: 'Renta\nvariable', path: '/taxes-rv', icon: TrendingUp },
          { name: 'Crowdfunding', path: '/taxes-cf', icon: Landmark },
          { name: 'Impuestos', path: '/taxes-total', icon: Scale }
        ] 
      }
    ],
    'Dashboard': [
      { 
        group: 'Dashboard', 
        items: [
          { name: 'Contabilidad', action: 'dashboard:contabilidad', icon: PieChart },
          { name: 'Inversiones\ninmobiliarias', action: 'dashboard:inversiones', icon: Building2 },
          { name: 'Renta\nvariable', action: 'dashboard:rv', icon: TrendingUp },
          { name: 'Crowdfunding', action: 'dashboard:cf', icon: Landmark }
        ] 
      }
    ],
    'Impresion': [
      { 
        group: 'Acciones', 
        items: [
          { name: 'Imprimir\nReporte', action: 'print:execute', icon: Printer }
        ] 
      }
    ],
    'Importador': [
      { group: 'Acciones', items: [
        { name: 'Importar\nDatos', path: '/importador', icon: Upload },
        { name: 'Descargar plantilla\nimportación', path: '/importador?tab=plantillas', icon: FileSpreadsheet }
      ]}
    ],
    'Manual': [
      { group: 'Ayuda', items: [{ name: 'Manual', path: '#', icon: BookOpen }] }
    ],
    'Soporte': [
      { group: 'Soporte', items: [{ name: 'Soporte', path: '#', icon: Users }] }
    ]
  };

  const closeDropdowns = () => {
    setDropdownOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#e2e8f0] font-sans overflow-hidden select-none">
      <header className="bg-[#4e80c8] text-white flex flex-col shadow-inner z-50 relative">
        <div className="flex justify-between items-center w-full px-2 py-1">
          <div className="flex items-center space-x-2 shrink-0 w-1/3 relative">
            <button 
              className="p-1.5 hover:bg-white/20 rounded mr-2 flex items-center space-x-2 transition-colors"
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
              }}
            >
              <span className="text-[12px] font-semibold">{activeModule}</span>
              <span className="text-[9px]">▼</span>
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998]" onClick={closeDropdowns}></div>
                <div className="fixed top-0 left-0 h-screen w-64 bg-[#4e80c8] text-white shadow-2xl z-[9999] flex flex-col font-sans">
                  <div className="flex items-center justify-end px-6 pt-4 pb-2">
                  <button 
                    onClick={closeDropdowns} 
                    className="p-1.5 border border-white rounded-full hover:bg-white/20 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="flex-1 py-4 flex flex-col">
                  {modules.map((modName, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => {
                        setActiveModule(modName);
                        const firstTab = moduleTabs[modName][0];
                        setActiveTab(firstTab);
                        navigate(tabDefaultPaths[firstTab] || '#');
                        closeDropdowns();
                      }}
                      className={`px-8 py-3 cursor-pointer flex justify-start items-center transition-colors text-[14px] border-b border-white/5
                        ${activeModule === modName ? 'bg-white/20 font-bold border-l-4 border-l-white' : 'hover:bg-white/10 border-l-4 border-l-transparent'}`}
                    >
                      {modName}
                    </div>
                  ))}
                  
                  <div className="mt-auto border-t border-white/20 pt-2">
                    <div 
                      onClick={() => {
                        closeDropdowns();
                        setIsSettingsOpen(true);
                      }}
                      className="px-8 py-3 cursor-pointer flex justify-start items-center transition-colors text-[14px] hover:bg-white/10 border-l-4 border-l-transparent"
                    >
                      Configuración
                    </div>
                    <div 
                      onClick={() => {
                        closeDropdowns();
                        logout();
                      }}
                      className="px-8 py-3 cursor-pointer flex justify-start items-center transition-colors text-[14px] hover:bg-white/10 border-l-4 border-l-transparent text-red-300"
                    >
                      Cerrar Sesión
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          </div>
          
          <div className="flex items-center justify-center shrink-0 w-1/3">
            <button 
              onClick={() => { setActiveModule('Módulos'); setActiveTab(''); navigate('/'); setShowRibbon(false); }}
              className="font-black text-sm tracking-widest uppercase text-white/90 drop-shadow-sm hover:text-white transition-colors cursor-pointer"
            >
              Nexo
            </button>
          </div>

          <div className="flex items-center justify-end w-1/3 space-x-2 shrink-0 pr-2">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] uppercase font-bold text-white/90 leading-tight truncate max-w-[120px]">{user?.email}</p>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Configuración"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onPointerDown={(e) => { e.preventDefault(); logout(); }}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-end px-2 pt-1 border-b border-[#3b6bb8] relative">
          <nav className="flex items-end space-x-0">
            {moduleTabs[activeModule]?.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  navigate(tabDefaultPaths[tab] || '#');
                }}
                className={`px-3 py-1.5 text-[12px] transition-colors border-t border-l border-r border-b-0 ${activeTab === tab ? 'bg-[#f3f4f6] text-black border-transparent relative top-[1px]' : 'bg-transparent text-white border-transparent hover:bg-white/10'}`}
              >
                {tab === 'Activos RV' ? 'Activos' : tab === 'Métricas RV' ? 'Métricas' : tab}
              </button>
            ))}
          </nav>
          
          <div className="absolute right-2 bottom-1 z-10 flex items-center h-[24px]">
            <button 
              onClick={() => setShowRibbon(!showRibbon)}
              className="p-1 hover:bg-black/10 backdrop-blur-sm rounded text-white transition-colors"
              title={showRibbon ? "Ocultar panel de opciones" : "Mostrar panel de opciones"}
            >
              {showRibbon ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {showRibbon && (
        <div className="bg-[#f3f4f6] border-b border-gray-300 flex h-[95px] overflow-x-auto overflow-y-hidden whitespace-nowrap shrink-0 shadow-sm select-none relative w-full scrollbar-hide">
          {tabRibbons[activeTab] && tabRibbons[activeTab].map((group, gIdx) => (
            <div key={gIdx} className="flex flex-col border-r border-gray-300">
              <div className="flex-1 flex items-stretch px-1 pt-1">
              {group.items.map((item, iIdx) => {
                const isActive = !item.action && item.path && item.path !== '#' && location.pathname + location.search === item.path;
                const isExport = item.name === 'Exportar';
                const isAddColumn = item.name === 'Añadir columna';
                return (
                  <div key={iIdx} className="relative flex flex-col">
                    <button 
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (isExport) {
                          setDropdownConfig(prev => prev?.type === 'export' ? null : { type: 'export', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (isAddColumn) {
                          setDropdownConfig(prev => prev?.type === 'column' ? null : { type: 'column', action: item.action, tab: activeTab, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'dashboard:contabilidad') {
                          setDropdownConfig(prev => prev?.type === 'dash-cont' ? null : { type: 'dash-cont', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'reports:contabilidad') {
                          setDropdownConfig(prev => prev?.type === 'reports-cont' ? null : { type: 'reports-cont', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'dashboard:inversiones') {
                          setDropdownConfig(prev => prev?.type === 'dash-inv' ? null : { type: 'dash-inv', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'dashboard:rv') {
                          setDropdownConfig(prev => prev?.type === 'dash-rv' ? null : { type: 'dash-rv', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'dashboard:cf') {
                          setDropdownConfig(prev => prev?.type === 'dash-cf' ? null : { type: 'dash-cf', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'taxes:year-dropdown') {
                          setDropdownConfig(prev => prev?.type === 'taxes-year' ? null : { type: 'taxes-year', action: item.action, rect: { top: rect.bottom, left: rect.left } });
                        } else if (item.action === 'taxes:extract') {
                          e.preventDefault();
                          window.dispatchEvent(new CustomEvent('taxes:extract', { detail: { year: taxYear } }));
                        } else if (item.action) {
                          e.preventDefault();
                          window.dispatchEvent(new CustomEvent(item.action));
                        } else if (item.path && item.path !== '#') {
                          navigate(item.path);
                        }
                      }}
                      className={`flex flex-col items-center justify-start px-1.5 py-0.5 mx-0.5 rounded border transition-all min-w-[60px] group
                        ${isActive 
                          ? 'bg-blue-100/50 border-blue-300 shadow-inner' 
                          : 'bg-transparent border-transparent hover:bg-white hover:border-[#b4c7dc] hover:shadow-sm'
                        }`}
                    >
                      <div className="h-6 flex items-center justify-center mb-1 transition-transform group-hover:scale-105">
                        {item.customIcon ? (
                          <RibbonCustomIcon type={item.customIcon} />
                        ) : (
                          <item.icon className="w-5 h-5 text-[#4e80c8]" strokeWidth={1.5} />
                        )}
                      </div>
                      <span className="text-[10px] leading-[1.1] text-gray-700 font-medium text-center whitespace-pre-wrap flex flex-col items-center justify-center">
                        {item.name} 
                        {(isExport || isAddColumn || item.action === 'dashboard:contabilidad' || item.action === 'dashboard:inversiones' || item.action === 'dashboard:rv' || item.action === 'dashboard:cf' || item.action === 'reports:contabilidad') && <ChevronDown className="w-3 h-3 mt-0.5" />}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="h-[18px] flex items-center justify-center text-[10px] text-gray-500 font-medium bg-gradient-to-t from-gray-200/50 to-transparent border-t border-gray-200/50">
              {group.group}
            </div>
          </div>
        ))}
        
          <div className="flex-1"></div>
        </div>
      )}

      {/* Dropdowns fixed portal */}
      {dropdownConfig?.type === 'export' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-32 flex flex-col text-[11px]" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { window.dispatchEvent(new CustomEvent(dropdownConfig.action, { detail: { format: 'pdf' } })); setDropdownConfig(null); }}>PDF (.pdf)</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { window.dispatchEvent(new CustomEvent(dropdownConfig.action, { detail: { format: 'excel' } })); setDropdownConfig(null); }}>Excel (.xls)</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { window.dispatchEvent(new CustomEvent(dropdownConfig.action, { detail: { format: 'csv' } })); setDropdownConfig(null); }}>CSV (.csv)</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { window.dispatchEvent(new CustomEvent(dropdownConfig.action, { detail: { format: 'json' } })); setDropdownConfig(null); }}>JSON (.json)</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { window.dispatchEvent(new CustomEvent(dropdownConfig.action, { detail: { format: 'xml' } })); setDropdownConfig(null); }}>XML (.xml)</div>
        </div>
      )}

      {dropdownConfig?.type === 'column' && availableColumnsByTab[dropdownConfig.tab] && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-56 flex flex-col text-[11px] max-h-64 overflow-y-auto" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          {availableColumnsByTab[dropdownConfig.tab].map((colOrGroup, idx) => {
            if (colOrGroup.group) {
              return (
                <div key={idx} className="mb-1">
                  <div className="px-2 py-1 bg-slate-200/80 font-bold text-slate-700 uppercase tracking-tight sticky top-0 border-y border-slate-300 text-[9px]">{colOrGroup.group}</div>
                  {colOrGroup.items.map(col => {
                    const isVisible = activeColumns[dropdownConfig.tab]?.includes(col.id);
                    return (
                      <div 
                        key={col.id}
                        className="px-4 py-1.5 hover:bg-gray-100 cursor-pointer text-left flex items-center" 
                        onClick={() => { 
                          window.dispatchEvent(new CustomEvent('toggle-column', { detail: { columnId: col.id, action: dropdownConfig.action } })); 
                        }}
                      >
                        <input type="checkbox" checked={!!isVisible} readOnly className="mr-2 pointer-events-none" />
                        <span>{col.name}</span>
                      </div>
                    )
                  })}
                </div>
              );
            } else {
              const col = colOrGroup;
              const isVisible = activeColumns[dropdownConfig.tab]?.includes(col.id);
              return (
                <div 
                  key={col.id}
                  className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-left flex items-center" 
                  onClick={() => { 
                    window.dispatchEvent(new CustomEvent('toggle-column', { detail: { columnId: col.id, action: dropdownConfig.action } })); 
                  }}
                >
                  <input type="checkbox" checked={!!isVisible} readOnly className="mr-2 pointer-events-none" />
                  <span>{col.name}</span>
                </div>
              )
            }
          })}
        </div>
      )}

      {dropdownConfig?.type === 'reports-cont' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-48 flex flex-col text-[11px]" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/reports?tab=balance'); }}>Balance de situación</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/reports?tab=income'); }}>Resultados</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/reports?tab=cashflow'); }}>Flujos de caja</div>
        </div>
      )}

      {dropdownConfig?.type === 'dash-cont' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-48 flex flex-col text-[11px]" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'contabilidad_balance' } }); }}>Balance</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'contabilidad_resultados' } }); }}>Cuenta de resultados</div>
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'contabilidad_flujo' } }); }}>Flujo de caja</div>
        </div>
      )}

      {dropdownConfig?.type === 'dash-inv' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-48 flex flex-col text-[11px] max-h-64 overflow-y-auto" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
           <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'inversiones_todos' } }); }}>Todos los activos</div>
           {realEstates.length > 0 && <div className="border-t border-gray-200 mt-1 mb-1"></div>}
           {realEstates.map(re => (
             <div key={re.id} className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left truncate" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: `inversiones_${re.id}` } }); }}>
               {re.name || re.address || re.id}
             </div>
           ))}
        </div>
      )}

      {dropdownConfig?.type === 'dash-rv' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-48 flex flex-col text-[11px] max-h-64 overflow-y-auto" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'rv_plusvalias_todos' } }); }}>Plusvalías (Todos)</div>
          <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'rv_dividendos_todos' } }); }}>Dividendos (Todos)</div>
          
          {rvAssets.filter(a => a.type?.toLowerCase() !== 'divisa').length > 0 && (
            <>
              <div className="border-t border-gray-200 mt-1 mb-1"></div>
              <div className="px-3 py-0.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider">Filtrar por Activo</div>
              {rvAssets.filter(a => a.type?.toLowerCase() !== 'divisa').map(a => (
                <div key={a.id} className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left truncate pl-5" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: `rv_asset_${a.id}` } }); }}>
                  {a.id} - {a.name}
                </div>
              ))}
            </>
          )}

          {rvBrokers.length > 0 && (
            <>
              <div className="border-t border-gray-200 mt-1 mb-1"></div>
              <div className="px-3 py-0.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider">Filtrar por Broker</div>
              {rvBrokers.map(b => (
                <div key={b.id} className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left truncate pl-5" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: `rv_broker_${b.id}` } }); }}>
                  {b.name || b.id}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {dropdownConfig?.type === 'dash-cf' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-48 flex flex-col text-[11px] max-h-64 overflow-y-auto" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'cf_plusvalias_todos' } }); }}>Plusvalías (Todos)</div>
          <div className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left font-bold" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: 'cf_dividendos_todos' } }); }}>Dividendos (Todos)</div>
          
          {cfProjects.length > 0 && (
            <>
              <div className="border-t border-gray-200 mt-1 mb-1"></div>
              <div className="px-3 py-0.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider">Filtrar por Activo</div>
              {cfProjects.map(p => (
                <div key={p.id} className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left truncate pl-5" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: `cf_project_${p.id}` } }); }}>
                  {p.id} - {p.name}
                </div>
              ))}
            </>
          )}

          {cfPlatforms.length > 0 && (
            <>
              <div className="border-t border-gray-200 mt-1 mb-1"></div>
              <div className="px-3 py-0.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider">Filtrar por Plataforma</div>
              {cfPlatforms.map(plt => (
                <div key={plt.id} className="px-3 py-1 hover:bg-gray-100 cursor-pointer text-left truncate pl-5" onClick={() => { setDropdownConfig(null); navigate('/dashboard', { state: { dashboardType: `cf_platform_${plt.id}` } }); }}>
                  {plt.name || plt.id}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {dropdownConfig?.type === 'taxes-year' && (
        <div 
          className="fixed bg-white border border-gray-300 shadow-lg rounded z-[100] py-1 w-32 flex flex-col text-[12px] max-h-64 overflow-y-auto" 
          style={{ top: dropdownConfig.rect.top + 4, left: dropdownConfig.rect.left }}
          onMouseDown={e => e.stopPropagation()}
        >
           <div 
             className={`px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-center border-b border-gray-200 ${taxYear === 'Todas' ? 'font-bold bg-blue-50 text-blue-700' : ''}`} 
             onClick={() => { 
               setTaxYear('Todas'); 
               setDropdownConfig(null); 
             }}
           >
             Todas las fechas
           </div>
           {[...Array(10)].map((_, i) => {
             const year = new Date().getFullYear() - i + 1;
             return (
               <div 
                 key={year} 
                 className={`px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-center ${taxYear === year ? 'font-bold bg-blue-50 text-blue-700' : ''}`} 
                 onClick={() => { 
                   setTaxYear(year); 
                   setDropdownConfig(null); 
                 }}
               >
                 {year}
               </div>
             );
           })}
        </div>
      )}

      <main className="flex-1 overflow-auto relative bg-white m-1">
        <div className="h-full">
          <Outlet context={{ tableZoom, setTableZoom, taxYear }} />
        </div>
      </main>

      <PunteoModal isOpen={showPunteoModal} onClose={() => setShowPunteoModal(false)} />
      <BankReconciliationModal isOpen={showBankReconciliationModal} onClose={() => setShowBankReconciliationModal(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} realEstates={realEstates} />

      <footer className="bg-[#a0aec0] border-t border-[#718096] flex justify-between px-3 py-0.5 text-[9px] font-bold text-slate-800 uppercase tracking-widest shadow-inner">
        <div className="flex space-x-6 items-center">
          <div className="flex items-center border-r border-[#718096] pr-4 py-0.5">
            <span className="bg-[#0b3b80] text-white px-1.5 rounded-sm mr-2">U</span>
            <span>Usuario: {user?.email?.split('@')[0].toUpperCase()}</span>
          </div>
          <div className="flex items-center">
            <span className="bg-[#0b3b80] text-white px-1.5 rounded-sm mr-2">D</span>
            <span>Base de datos: Firestore Cloud</span>
          </div>
        </div>

        <div className="flex space-x-4 items-center">
          <div className="border-l border-[#718096] pl-4 flex space-x-4">
            <span>{new Date().toLocaleDateString()}</span>
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
