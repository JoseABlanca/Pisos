import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Search,
  FolderOpen,
  Folder,
  FileText,
  AlertTriangle,
  Files,
  FileEdit,
  FileX,
  PanelLeft
} from 'lucide-react';
import { pgcAccounts } from '../data/pgcAccounts';
import ZoomControl from '../components/ZoomControl';

import { CustomIcon } from '../components/CustomIcons';
import ResizableSidebar from '../components/ResizableSidebar';

// Descripciones del Plan General Contable
const PGC_DESCRIPTIONS = {
  // Grupo 1: Financiación Básica
  '10': 'Capital (Aportaciones de socios)',
  '100': 'Capital social: Capital en sociedades mercantiles.',
  '11': 'Reservas (Beneficios retenidos)',
  '112': 'Reserva legal: Obligatoria por ley (10% del beneficio hasta el 20% del capital).',
  '12': 'Resultados pendientes de aplicación',
  '129': 'Resultado del ejercicio: Pérdidas o ganancias del año actual.',
  '17': 'Deudas a largo plazo por préstamos recibidos',
  '170': 'Deudas a L/P con entidades de crédito: Préstamos bancarios con vencimiento > 1 año.',

  // Grupo 2: Activo No Corriente
  '20': 'Inmovilizado intangible (Activos inmateriales)',
  '206': 'Aplicaciones informáticas: Software y programas propiedad de la empresa.',
  '21': 'Inmovilizado material (Activos físicos)',
  '210': 'Terrenos y bienes naturales: Suelos urbanos o rústicos.',
  '211': 'Construcciones: Edificaciones, naves, locales.',
  '218': 'Elementos de transporte: Vehículos de todo tipo.',
  '28': 'Amortización acumulada (Corrección de valor)',
  '281': 'Amortización acumulada del inmovilizado material: El "ahorro" por el desgaste de los bienes.',

  // Grupo 3: Existencias
  '30': 'Comerciales (Mercaderías)',
  '300': 'Mercaderías A: Bienes que se venden sin transformar.',
  '31': 'Materias primas',
  '310': 'Materias primas: Elementos destinados a ser transformados.',

  // Grupo 4: Acreedores y Deudores por Operaciones Comerciales
  '40': 'Proveedores',
  '400': 'Proveedores: Deudas por compra de existencias.',
  '41': 'Acreedores varios',
  '410': 'Acreedores por prestaciones de servicios: Deudas por luz, alquiler, abogados, etc.',
  '43': 'Clientes',
  '430': 'Clientes: Personas que nos deben dinero por nuestra actividad principal.',
  '47': 'Administraciones Públicas (Impuestos)',
  '472': 'Hacienda Pública, IVA soportado: IVA pagado en compras.',
  '477': 'Hacienda Pública, IVA repercutido: IVA cobrado en ventas.',
  '4751': 'Hacienda Pública, acreedora por retenciones (IRPF): Retenciones de nóminas o alquileres.',

  // Grupo 5: Cuentas Financieras
  '52': 'Deudas a corto plazo',
  '520': 'Deudas a C/P con entidades de crédito: La parte del préstamo que vence este año.',
  '57': 'Tesorería',
  '570': 'Caja: Dinero físico.',
  '572': 'Bancos e instituciones de crédito: Cuentas corrientes.',

  // Grupo 6: Compras y Gastos
  '60': 'Compras',
  '600': 'Compras de mercaderías: Adquisición de bienes para la venta.',
  '62': 'Servicios exteriores',
  '621': 'Arrendamientos y cánones: Alquileres de locales.',
  '628': 'Suministros: Luz, agua, gas.',
  '629': 'Otros servicios: Teléfono, internet, papelería.',
  '64': 'Gastos de personal',
  '640': 'Sueldos y salarios: Nómina bruta.',
  '642': 'Seguridad Social a cargo de la empresa: Coste de la SS de la empresa.',

  // Grupo 7: Ventas e Ingresos
  '70': 'Ventas de mercaderías y servicios',
  '700': 'Ventas de mercaderías: Ingresos por venta de productos.',
  '705': 'Prestación de servicios: Ingresos por servicios realizados.'
};

// Función para obtener la descripción más específica disponible
const getAccountDescription = (code) => {
  // Buscar coincidencia exacta primero
  if (PGC_DESCRIPTIONS[code]) return PGC_DESCRIPTIONS[code];
  // Buscar por prefijo (de más específico a menos)
  for (let len = code.length; len > 0; len--) {
    const prefix = code.substring(0, len);
    if (PGC_DESCRIPTIONS[prefix]) return PGC_DESCRIPTIONS[prefix];
  }
  return null;
};

export default function Accounts({ isModal = false, onAccountSelect = null }) {
  const { user, queryUserIds } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.pathname === '/pgc' ? 'pgc' : 'tree');
  
  useEffect(() => {
    setActiveTab(location.pathname === '/pgc' ? 'pgc' : 'tree');
  }, [location.pathname]);

  const [accounts, setAccounts] = useState([]);
  const [flatDocs, setFlatDocs] = useState([]); // flat list of all docs for lookups
  const [expandedNodes, setExpandedNodes] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [showPGC, setShowPGC] = useState(false);
  const [showAuxiliary, setShowAuxiliary] = useState(true);
  const [showObsolete, setShowObsolete] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [editingNode, setEditingNode] = useState(null);
  const [editValue, setEditValue] = useState({ code: '', name: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { account, childrenCount }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => {
        const data = d.id === 'user-root' ? {} : d.data();
        let parentId = data.parentId !== undefined ? data.parentId : data.parent_id;
        if (parentId === undefined) parentId = null;
        return { id: d.id, ...data, parentId };
      });
      setFlatDocs(docs);
      
      const buildTree = (pId = null) => {
        return docs
          .filter(a => a.parentId === pId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(a => ({
            ...a,
            children: buildTree(a.id)
          }));
      };
      
      const tree = buildTree(null);
      setAccounts(tree);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleExpand = (code) => {
    setExpandedNodes(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const expandAll = () => {
    const allCodes = {};
    const collectCodes = (nodes) => {
      nodes.forEach(n => {
        allCodes[n.code] = true;
        if (n.children) collectCodes(n.children);
      });
    };
    // Expand accounts from the active tab
    collectCodes(activeTab === 'tree' ? accounts : pgcAccounts);
    setExpandedNodes(allCodes);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  // ----- Helper functions (defined BEFORE renderTree) -----

  const findAccountById = (nodes, id) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findAccountById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const findInTree = (nodes, code) => {
    for (const node of nodes) {
      if (node.code === code) return node;
      if (node.children) {
        const found = findInTree(node.children, code);
        if (found) return found;
      }
    }
    return null;
  };

  const countDescendants = (node) => {
    if (!node.children || node.children.length === 0) return 0;
    let count = node.children.length;
    node.children.forEach(c => { count += countDescendants(c); });
    return count;
  };

  const collectAllIds = (node) => {
    let ids = [node.id];
    if (node.children) {
      node.children.forEach(c => { ids = [...ids, ...collectAllIds(c)]; });
    }
    return ids;
  };

  const getNodeLevel = (node) => {
    return node.code ? node.code.length : 0;
  };

  const getNodeTypeLabel = (node) => {
    const level = getNodeLevel(node);
    if (level <= 1) return 'Grupo';
    if (level <= 2) return 'Cuenta';
    return 'Subcuenta';
  };

  const getPGCSuggestions = (codePrefix = '') => {
    const findSuggestions = (nodes) => {
      let results = [];
      for (const node of nodes) {
        if (!codePrefix || node.code.startsWith(codePrefix)) {
          results.push({ code: node.code, name: node.name });
        }
        if (node.children) {
          results = [...results, ...findSuggestions(node.children)];
        }
      }
      return results;
    };
    
    const suggestions = findSuggestions(pgcAccounts);
    if (!codePrefix) return suggestions.filter(s => s.code.length === 1);
    if (codePrefix.length === 1) return suggestions.filter(s => s.code.length === 2 && s.code.startsWith(codePrefix));
    if (codePrefix.length === 2) return suggestions.filter(s => s.code.length === 3 && s.code.startsWith(codePrefix));
    if (codePrefix.length === 3) return suggestions.filter(s => s.code.length === 4 && s.code.startsWith(codePrefix));
    return [];
  };

  // ----- Action handlers -----

  const handleNew = () => {
    const parent = selectedNode ? findInTree(accounts, selectedNode) : null;
    const parentId = parent ? parent.id : null;
    const parentCode = parent ? parent.code : '';
    
    setEditingNode({ isNew: true, parentId, id: 'temp-' + Date.now() });
    setEditValue({ code: parentCode, name: '' });
    if (selectedNode) setExpandedNodes(prev => ({ ...prev, [selectedNode]: true }));
  };

  const getAccountTypeByCode = (code) => {
    const firstChar = code.charAt(0);
    switch (firstChar) {
      case '1': 
        // Grupo 1: Financiación Básica -> Pasivo o Patrimonio
        // En un esquema simplificado, distinguimos por subcódigo
        if (code.startsWith('10') || code.startsWith('11') || code.startsWith('12')) return 'Patrimonio';
        return 'Pasivo';
      case '2': return 'Activo'; // Inmovilizado
      case '3': return 'Activo'; // Existencias
      case '4': 
        // Grupo 4: Acreedores y Deudores
        if (code.startsWith('40') || code.startsWith('41') || code.startsWith('475')) return 'Pasivo';
        return 'Activo';
      case '5': 
        // Grupo 5: Cuentas Financieras
        if (code.startsWith('52') || code.startsWith('55')) return 'Pasivo';
        return 'Activo';
      case '6': return 'Gasto';
      case '7': return 'Ingreso';
      case '8': return 'Gasto'; // Gastos de patrimonio
      case '9': return 'Ingreso'; // Ingresos de patrimonio
      default: return 'Activo';
    }
  };

  const handleSave = async () => {
    console.log("handleSave called with:", { editValue, editingNode });
    if (!user || !editValue.code || !editValue.name) {
      console.warn("Missing required fields for saving account");
      return;
    }
    
    try {
      const type = getAccountTypeByCode(editValue.code);
      const accountData = {
        code: editValue.code,
        name: editValue.name,
        parentId: editingNode.parentId || null,
        type,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      console.log("Saving account data:", accountData);

      // Remove undefined values without stringifying everything
      const cleanData = Object.fromEntries(
        Object.entries(accountData).filter(([_, v]) => v !== undefined)
      );

      if (editingNode.isNew) {
        const docRef = await addDoc(collection(db, 'accounts'), {
          ...cleanData,
          balance_actual: 0,
          createdAt: new Date().toISOString(),
          order: Date.now()
        });
        console.log("New account created with ID:", docRef.id);
      } else {
        await updateDoc(doc(db, 'accounts', editingNode.id), cleanData);
        console.log("Account updated:", editingNode.id);
      }
      
      setEditingNode(null);
      setEditValue({ code: '', name: '' });
    } catch (error) {
      console.error("Error saving account:", error);
      alert("Error al guardar la cuenta: " + error.message);
    }
  };

  const handleMove = async (direction) => {
    if (!selectedNode) return;
    const account = findInTree(accounts, selectedNode);
    if (!account) return;

    const siblings = account.parentId
      ? findAccountById(accounts, account.parentId)?.children || []
      : accounts;

    // Ordenar hermanos por su order actual
    const sortedSiblings = [...siblings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sortedSiblings.findIndex(s => s.id === account.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex >= 0 && targetIndex < sortedSiblings.length) {
      try {
        // Reasignar órdenes para reflejar el nuevo orden visual
        // Intercambiar posiciones en el array ordenado
        const newOrder = [...sortedSiblings];
        [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];

        // Actualizar cada cuenta con su nuevo order
        const updates = newOrder.map((sibling, idx) =>
          updateDoc(doc(db, 'accounts', sibling.id), { order: idx * 10 })
        );

        await Promise.all(updates);
      } catch (error) {
        console.error("Error moving account:", error);
      }
    }
  };

  // Recursive delete: show custom confirmation modal
  const handleDeleteRequest = () => {
    if (!selectedNode) return;
    const account = findInTree(accounts, selectedNode);
    if (!account) return;
    
    const childrenCount = countDescendants(account);
    setDeleteConfirm({ account, childrenCount });
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    const { account } = deleteConfirm;
    
    try {
      // Collect all IDs to delete (the node + all descendants)
      const idsToDelete = collectAllIds(account);
      
      // Delete all in parallel
      const deletePromises = idsToDelete.map(id => deleteDoc(doc(db, 'accounts', id)));
      await Promise.all(deletePromises);
      
      setSelectedNode(null);
    } catch (error) {
      console.error("Error deleting account:", error);
    }
    
    setDeleteConfirm(null);
  };

  // ----- Tree Rendering -----

  const nodeMatchesSearch = (node, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(child => nodeMatchesSearch(child, query));
    return false;
  };

  const nodeMatchesBalance = (node, filter) => {
    if (filter === 'all') return true;
    if (node.balance_actual && node.balance_actual !== 0) return true;
    if (node.children) return node.children.some(child => nodeMatchesBalance(child, filter));
    return false;
  };

  const renderTreeRows = (nodes, isPGC = false, depth = 0) => {
    let rows = [];
    const indentSize = 16;
    
    // Group filter only applies to root nodes (depth 0)
    let filteredNodes = nodes;
    if (depth === 0 && selectedGroup !== 'all') {
      filteredNodes = nodes.filter(node => node.code && node.code.startsWith(selectedGroup));
    }
    
    // Search filter applies everywhere but recursively
    filteredNodes = filteredNodes.filter(node => nodeMatchesSearch(node, searchQuery));

    // Balance filter applies recursively
    filteredNodes = filteredNodes.filter(node => nodeMatchesBalance(node, balanceFilter));

    filteredNodes.forEach((node, idx) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes[node.code];
      const isSelected = selectedNode === node.code;
      const isEditing = editingNode && node.id && editingNode.id === node.id;
      const level = getNodeLevel(node);
      const hasNewChild = editingNode?.isNew && editingNode.parentId === node.id;

      if (isEditing) {
        rows.push(
          <tr key={`edit-${node.id}`} className="bg-yellow-50 border-b border-yellow-300">
            <td colSpan="2" className="px-3 py-1.5">
              <div className="flex items-center space-x-1" style={{ paddingLeft: `${depth * indentSize}px` }}>
                <input 
                  type="text"
                  value={editValue.code}
                  onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                  className="win-input w-20 text-[11px] font-mono font-bold"
                  placeholder="Código"
                  autoFocus
                />
                <div className="relative flex-1">
                  <input 
                    type="text"
                    value={editValue.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parentAcc = editingNode.parentId ? findAccountById(accounts, editingNode.parentId) : null;
                      const suggestion = getPGCSuggestions(parentAcc?.code || '').find(s => s.name === val);
                      if (suggestion) {
                        setEditValue({ code: suggestion.code, name: suggestion.name });
                      } else {
                        setEditValue({...editValue, name: val});
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') setEditingNode(null);
                    }}
                    className="win-input w-full text-[11px]"
                    placeholder="Nombre de la cuenta..."
                    list={`pgc-edit-${node.id}`}
                  />
                  <datalist id={`pgc-edit-${node.id}`}>
                    {getPGCSuggestions(node.parentId ? findAccountById(accounts, node.parentId)?.code : '').map(s => (
                      <option key={s.code} value={s.name}>{s.code} - {s.name}</option>
                    ))}
                  </datalist>
                </div>
                <button onClick={handleSave} className="p-1 bg-green-600 text-white rounded hover:bg-green-700" title="Guardar">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditingNode(null)} className="p-1 bg-slate-400 text-white rounded hover:bg-slate-500" title="Cancelar">
                  <Plus className="w-3.5 h-3.5 rotate-45" />
                </button>
              </div>
            </td>
          </tr>
        );
      } else {
        rows.push(
          <tr 
            key={node.id || node.code} 
            onClick={() => setSelectedNode(node.code)}
            onDoubleClick={() => {
              console.log("Account row double clicked:", node.code, node.name, "isModal:", isModal, "onAccountSelect:", typeof onAccountSelect);
              if (isModal && onAccountSelect) {
                onAccountSelect(node.code, node.name);
                return;
              }
              if (!isPGC) {
                toggleExpand(node.code);
                setEditingNode({ id: node.id, parentId: node.parentId, isNew: false });
                setEditValue({ code: node.code, name: node.name });
              } else {
                toggleExpand(node.code);
              }
            }}
            className={`border-b border-gray-100 cursor-pointer ${isSelected ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe] bg-white'}`}
          >
            <td className="px-3 py-1.5 border-r border-gray-100 font-mono text-[11px] whitespace-nowrap">
              <div className={`flex items-center ${isSelected ? 'text-white' : 'text-gray-700'}`} style={{ paddingLeft: `${depth * indentSize}px` }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.code); }}
                  className={`mr-1 p-0.5 hover:bg-black/10 backdrop-blur-sm rounded transition-colors flex-shrink-0 ${isSelected ? 'text-white' : 'text-gray-500'}`}
                  style={{ visibility: (hasChildren || hasNewChild) ? 'visible' : 'hidden' }}
                >
                  {isExpanded 
                    ? <ChevronDown className="w-3.5 h-3.5" /> 
                    : <ChevronRight className="w-3.5 h-3.5" />
                  }
                </button>
                {node.code}
              </div>
            </td>
            <td className={`px-3 py-1.5 uppercase text-[11px] ${isSelected ? 'text-white' : 'text-gray-800'}`}>{node.name}</td>
          </tr>
        );
      }

      if (isExpanded) {
        if (node.children) {
          rows.push(...renderTreeRows(node.children, isPGC, depth + 1));
        }
        
        if (hasNewChild) {
          rows.push(
            <tr key={`new-${node.id}`} className="bg-blue-50 border-b border-blue-300">
              <td colSpan="2" className="px-3 py-1.5">
                <div className="flex items-center space-x-1" style={{ paddingLeft: `${(depth + 1) * indentSize}px` }}>
                  <input 
                    type="text"
                    value={editValue.code}
                    onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                    className="win-input w-20 text-[11px] font-mono font-bold"
                    placeholder="Código"
                    autoFocus
                  />
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      value={editValue.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const suggestions = getPGCSuggestions(node.code);
                        const suggestion = suggestions.find(s => s.name === val);
                        if (suggestion) {
                          setEditValue({ code: suggestion.code, name: suggestion.name });
                        } else {
                          setEditValue({...editValue, name: val});
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') setEditingNode(null);
                      }}
                      className="win-input w-full text-[11px]"
                      placeholder="Nueva subcuenta..."
                      list={`pgc-new-${node.id}`}
                    />
                    <datalist id={`pgc-new-${node.id}`}>
                      {getPGCSuggestions(node.code).map(s => (
                        <option key={s.code} value={s.name}>{s.code} - {s.name}</option>
                      ))}
                    </datalist>
                  </div>
                  <button onClick={handleSave} className="p-1 bg-green-600 text-white rounded hover:bg-green-700" title="Guardar">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingNode(null)} className="p-1 bg-slate-400 text-white rounded hover:bg-slate-500" title="Cancelar">
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                  </button>
                </div>
              </td>
            </tr>
          );
        }
      }
    });

    return rows;
  };

  // ----- Summary counts -----
  const totalAccounts = flatDocs.length;
  const rootGroups = accounts.length;

  return (
    <div className={`w-full h-full relative ${isModal ? 'p-0' : 'p-4'}`}>
      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#ece9d8] border-2 border-[#0054e3] shadow-lg w-[420px]" onClick={e => e.stopPropagation()}>
            {/* Title bar */}
            <div className="bg-gradient-to-r from-[#0054e3] to-[#2670d8] px-3 py-1.5 flex items-center">
              <AlertTriangle className="w-4 h-4 text-white mr-2" />
              <span className="text-white text-[11px] font-bold">Confirmar eliminación</span>
            </div>
            {/* Body */}
            <div className="p-5 flex items-start space-x-4">
              <div className="w-10 h-10 bg-yellow-100 border border-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-slate-800 mb-2">
                  ¿Eliminar {getNodeTypeLabel(deleteConfirm.account).toLowerCase()} "{deleteConfirm.account.code} - {deleteConfirm.account.name}"?
                </p>
                {deleteConfirm.childrenCount > 0 && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 p-2 rounded">
                    ⚠️ Este {getNodeTypeLabel(deleteConfirm.account).toLowerCase()} contiene <strong>{deleteConfirm.childrenCount} elemento{deleteConfirm.childrenCount > 1 ? 's' : ''}</strong> hijo{deleteConfirm.childrenCount > 1 ? 's' : ''} que también se eliminarán.
                  </p>
                )}
                <p className="text-[10px] text-slate-500 mt-2">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            {/* Buttons */}
            <div className="bg-[#d4d0c8] px-4 py-3 flex justify-end space-x-2 border-t border-[#808080]">
              <button 
                onClick={handleDeleteConfirmed}
                className="btn-classic px-5 py-1 text-[10px] font-bold text-red-700 bg-red-50 border-red-300 hover:bg-red-100"
              >
                Sí, eliminar
              </button>
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="btn-classic px-5 py-1 text-[10px] font-bold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full flex flex-col bg-[#cbd5e0]">


          {/* Top Ribbon Toolbar */}
          <div className="bg-[#f3f4f6] border-b border-gray-300 flex items-center px-2 py-1 h-[80px] space-x-1 shrink-0 overflow-x-auto whitespace-nowrap">
            {activeTab === 'tree' && (
              <>
                <button 
                  onClick={handleNew}
                  className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105"
                >
                  <CustomIcon type="Nuevo" />
                  <span className="text-[11px] text-gray-700 font-medium mt-1">Nuevo</span>
                  <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
                </button>
                <button 
                  onClick={() => {
                    if (!selectedNode) return;
                    const node = findInTree(accounts, selectedNode);
                    if (node) {
                      setEditingNode({ id: node.id, parentId: node.parentId, isNew: false });
                      setEditValue({ code: node.code, name: node.name });
                    }
                  }}
                  className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105"
                >
                  <CustomIcon type="Modificar" />
                  <span className="text-[11px] text-gray-700 font-medium mt-1">Modificar</span>
                  <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
                </button>
                <button 
                  onClick={handleDeleteRequest}
                  className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105"
                >
                  <CustomIcon type="Eliminar" />
                  <span className="text-[11px] text-gray-700 font-medium mt-1">Eliminar</span>
                  <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
                </button>
                
                {/* Separator */}
                <div className="w-[1px] h-12 bg-gray-300 mx-2"></div>
                
                <button 
                  onClick={() => handleMove('up')}
                  className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300"
                >
                  <ArrowUp className="w-6 h-6 text-gray-600 mb-1" strokeWidth={1.5} />
                  <span className="text-[11px] text-gray-700">Subir</span>
                </button>
                <button 
                  onClick={() => handleMove('down')}
                  className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300"
                >
                  <ArrowDown className="w-6 h-6 text-gray-600 mb-1" strokeWidth={1.5} />
                  <span className="text-[11px] text-gray-700">Bajar</span>
                </button>
                <div className="w-[1px] h-12 bg-gray-300 mx-2"></div>
              </>
            )}
            
            <button 
              onClick={expandAll}
              className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105"
            >
              <CustomIcon type="Expandir" />
              <span className="text-[11px] text-gray-700 mt-1">Expandir</span>
            </button>
            <button 
              onClick={collapseAll}
              className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105"
            >
              <CustomIcon type="Colapsar" />
              <span className="text-[11px] text-gray-700 mt-1">Colapsar</span>
            </button>
          </div>

          {/* Main Content Area: Sidebar + Table */}
          <div className="flex-1 flex bg-white border-x border-b border-[#718096] overflow-hidden">
            
            {/* Left Sidebar */}
            {showSidebar && (
              <ResizableSidebar className=" bg-[#f8f9fa] border-r border-[#d1d5db] flex flex-col shrink-0">
              <div className="bg-[#e9ecef] font-bold text-[12px] px-3 py-1.5 border-b border-[#d1d5db] text-gray-700">Lista actual</div>
              <div className="p-3 space-y-1.5 flex-1 overflow-y-auto text-[11px] text-gray-800">
                <label className="flex items-center space-x-2 cursor-pointer mb-2">
                  <input type="radio" name="group" checked={selectedGroup === 'all'} onChange={() => setSelectedGroup('all')} />
                  <span className="font-medium text-blue-800">Todos los grupos</span>
                </label>
                {[0,1,2,3,4,5,6,7,8,9].map(num => (
                  <label key={num} className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="group" checked={selectedGroup === String(num)} onChange={() => setSelectedGroup(String(num))} />
                    <span>Mostrar grupo {num}</span>
                  </label>
                ))}
                
                <div className="my-3 border-t border-gray-300"></div>
                
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={showPGC} onChange={(e) => setShowPGC(e.target.checked)} />
                  <span>Mostrar cuentas del PGC</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={showAuxiliary} onChange={(e) => setShowAuxiliary(e.target.checked)} />
                  <span className="font-medium text-blue-800">Mostrar cuentas auxiliares</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={showObsolete} onChange={(e) => setShowObsolete(e.target.checked)} />
                  <span>Mostrar cuentas obsoletas</span>
                </label>
              </div>

              <div className="bg-[#e9ecef] text-[11px] px-3 py-1.5 border-t border-b border-[#d1d5db] text-gray-700">Ver saldos del diario</div>
              <div className="p-3 bg-[#f8f9fa]">
                <select 
                  className="w-full border border-gray-300 p-1 text-[11px]"
                  value={balanceFilter}
                  onChange={(e) => setBalanceFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="with-balance">Con saldo</option>
                </select>
              </div>
              </ResizableSidebar>
            )}

            {/* Main Table Area */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
              {/* Header with Title and Search */}
              <div className="flex justify-between items-center px-4 py-2 border-b border-[#d1d5db]">
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300"
                    title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Buscar en el fichero (Alt+B)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500"
                  />
                  <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
                </div>
              </div>
              
              {/* Table */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                    <thead className="sticky top-0 bg-white shadow-[0_1px_0_#d1d5db] z-10">
                      <tr className="text-gray-700">
                        <th className="px-3 py-2 font-normal border-r border-[#d1d5db] uppercase">Cuenta</th>
                        <th className="px-3 py-2 font-normal uppercase">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderTreeRows(activeTab === 'pgc' ? pgcAccounts : (showPGC ? pgcAccounts : accounts), activeTab === 'pgc' || showPGC)}
                      
                      {/* Root level new account form */}
                      {editingNode?.isNew && !editingNode.parentId && (
                        <tr className="bg-blue-50 border-b border-blue-300">
                          <td colSpan="2" className="px-3 py-1.5">
                            <div className="flex items-center space-x-1">
                              <input 
                                type="text"
                                value={editValue.code}
                                onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                                className="win-input w-20 text-[11px] font-mono font-bold"
                                placeholder="Cód."
                                autoFocus
                              />
                              <div className="relative flex-1">
                                <input 
                                  type="text"
                                  value={editValue.name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const suggestions = getPGCSuggestions('');
                                    const suggestion = suggestions.find(s => s.name === val);
                                    if (suggestion) {
                                      setEditValue({ code: suggestion.code, name: suggestion.name });
                                    } else {
                                      setEditValue({...editValue, name: val});
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSave();
                                    if (e.key === 'Escape') setEditingNode(null);
                                  }}
                                  className="win-input w-full text-[11px]"
                                  placeholder="Nuevo grupo raíz..."
                                  list="pgc-suggestions-root-main"
                                />
                                <datalist id="pgc-suggestions-root-main">
                                  {getPGCSuggestions('').map(s => (
                                    <option key={s.code} value={s.name}>{s.code} - {s.name}</option>
                                  ))}
                                </datalist>
                              </div>
                              <button onClick={handleSave} className="p-1 bg-green-600 text-white rounded hover:bg-green-700" title="Guardar">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingNode(null)} className="p-1 bg-slate-400 text-white rounded hover:bg-slate-500" title="Cancelar">
                                <Plus className="w-3.5 h-3.5 rotate-45" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      
                      {accounts.length === 0 && !showPGC && !editingNode && (
                        <tr>
                          <td colSpan="2" className="text-center py-8 text-gray-400">
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                              <Folder className="w-12 h-12 mb-3 text-slate-300" />
                              <p className="text-[12px] font-semibold mb-1">Tu árbol de cuentas está vacío</p>
                              <p className="text-[10px]">Pulsa "Nuevo" para crear tu primer grupo contable</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex justify-end p-1 bg-[#f0f0f0] border-t border-[#808080]">
                <ZoomControl />
              </div>
            </div>
          </div>

        </div>
    </div>
  );
}
