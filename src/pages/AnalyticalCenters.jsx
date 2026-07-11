import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, ChevronDown, Check, Plus, AlertTriangle, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { CustomIcon } from '../components/CustomIcons';

export default function AnalyticalCenters({ type, isModal = false, onSelect = null }) {
  const { user, queryUserIds } = useAuth();
  const [centers, setCenters] = useState([]);
  const [flatDocs, setFlatDocs] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editValue, setEditValue] = useState({ code: '', name: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState('');

  const title = type === 'ceco' ? 'Centros de Coste (CECOS)' : 'Centros de Beneficio (CEBES)';
  const collectionName = 'analytical_centers';

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, collectionName), 
      where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]),
      where('type', '==', type)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setFlatDocs(docs);
      
      const buildTree = (parentId = null) => {
        return docs
          .filter(node => (node.parentId || null) === parentId)
          .sort((a, b) => (a.order || 0) - (b.order || 0) || a.code.localeCompare(b.code))
          .map(node => ({
            ...node,
            children: buildTree(node.id)
          }));
      };

      setCenters(buildTree(null));
    });

    return () => unsubscribe();
  }, [user, type, queryUserIds]);

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
    collectCodes(centers);
    setExpandedNodes(allCodes);
  };

  const collapseAll = () => {
    setExpandedNodes({});
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

  const findById = (nodes, id) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findById(node.children, id);
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

  const handleNew = () => {
    const parent = selectedNode ? findInTree(centers, selectedNode) : null;
    const parentId = parent ? parent.id : null;
    const parentCode = parent ? parent.code : '';
    
    setEditingNode({ isNew: true, parentId, id: 'temp-' + Date.now() });
    setEditValue({ code: parentCode, name: '' });
    if (selectedNode) setExpandedNodes(prev => ({ ...prev, [selectedNode]: true }));
  };

  const handleSave = async () => {
    if (!user || !editValue.code || !editValue.name) return;
    try {
      if (editingNode.isNew) {
        await addDoc(collection(db, collectionName), {
          code: editValue.code,
          name: editValue.name,
          parentId: editingNode.parentId || null,
          type: type,
          userId: user.uid,
          createdAt: new Date().toISOString(),
          order: Date.now()
        });
      } else {
        await updateDoc(doc(db, collectionName, editingNode.id), {
          code: editValue.code,
          name: editValue.name
        });
      }
      setEditingNode(null);
      setEditValue({ code: '', name: '' });
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error al guardar: ' + error.message);
    }
  };

  const handleDeleteRequest = () => {
    if (!selectedNode) return;
    const node = findInTree(centers, selectedNode);
    if (!node) return;
    const childrenCount = countDescendants(node);
    setDeleteConfirm({ node, childrenCount });
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    try {
      const idsToDelete = collectAllIds(deleteConfirm.node);
      await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, collectionName, id))));
      setSelectedNode(null);
    } catch (error) {
      console.error("Error deleting:", error);
    }
    setDeleteConfirm(null);
  };

  const handleMove = async (direction) => {
    if (!selectedNode) return;
    const node = findInTree(centers, selectedNode);
    if (!node) return;

    const siblings = node.parentId
      ? findById(centers, node.parentId)?.children || []
      : centers;

    const sortedSiblings = [...siblings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sortedSiblings.findIndex(s => s.id === node.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex >= 0 && targetIndex < sortedSiblings.length) {
      try {
        const newOrder = [...sortedSiblings];
        [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];
        const updates = newOrder.map((sibling, idx) =>
          updateDoc(doc(db, collectionName, sibling.id), { order: idx * 10 })
        );
        await Promise.all(updates);
      } catch (error) {
        console.error("Error moving:", error);
      }
    }
  };

  const nodeMatchesSearch = (node, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(child => nodeMatchesSearch(child, query));
    return false;
  };

  const renderTreeRows = (nodes, depth = 0) => {
    let rows = [];
    const indentSize = 16;

    const filteredNodes = nodes.filter(node => nodeMatchesSearch(node, searchQuery));

    filteredNodes.forEach(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes[node.code];
      const isSelected = selectedNode === node.code;
      const isEditing = editingNode && node.id && editingNode.id === node.id;
      const hasNewChild = editingNode?.isNew && editingNode.parentId === node.id;

      if (isEditing) {
        rows.push(
          <tr key={`edit-` + node.id} className="bg-yellow-50 border-b border-yellow-300">
            <td colSpan="2" className="px-3 py-1.5">
              <div className="flex items-center space-x-1" style={{ paddingLeft: depth * indentSize + 'px' }}>
                <input 
                  type="text"
                  value={editValue.code}
                  onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                  className="win-input w-24 text-[11px] font-mono font-bold"
                  placeholder="Código"
                  autoFocus
                />
                <input 
                  type="text"
                  value={editValue.name}
                  onChange={(e) => setEditValue({...editValue, name: e.target.value})}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') setEditingNode(null);
                  }}
                  className="win-input flex-1 text-[11px]"
                  placeholder="Descripción..."
                />
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
            key={node.id} 
            onClick={() => setSelectedNode(node.code)}
            onDoubleClick={() => {
              if (isModal && onSelect) {
                onSelect(node.code, node.name);
                return;
              }
              toggleExpand(node.code);
              setEditingNode({ id: node.id, parentId: node.parentId, isNew: false });
              setEditValue({ code: node.code, name: node.name });
            }}
            className={`border-b border-gray-100 cursor-pointer ${isSelected ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe] bg-white'}`}
          >
            <td className="px-3 py-1.5 border-r border-gray-100 font-mono text-[11px] whitespace-nowrap">
              <div className={`flex items-center ${isSelected ? 'text-white' : 'text-gray-700'}`} style={{ paddingLeft: depth * indentSize + 'px' }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.code); }}
                  className={`mr-1 p-0.5 hover:bg-black/10 backdrop-blur-sm rounded transition-colors flex-shrink-0 ${isSelected ? 'text-white' : 'text-gray-500'}`}
                  style={{ visibility: (hasChildren || hasNewChild) ? 'visible' : 'hidden' }}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {node.code}
              </div>
            </td>
            <td className={`px-3 py-1.5 text-[11px] ${isSelected ? 'text-white' : 'text-gray-800'}`}>{node.name}</td>
          </tr>
        );
      }

      if (isExpanded) {
        if (node.children) {
          rows.push(...renderTreeRows(node.children, depth + 1));
        }
        
        if (hasNewChild) {
          rows.push(
            <tr key={`new-` + node.id} className="bg-blue-50 border-b border-blue-300">
              <td colSpan="2" className="px-3 py-1.5">
                <div className="flex items-center space-x-1" style={{ paddingLeft: (depth + 1) * indentSize + 'px' }}>
                  <input 
                    type="text"
                    value={editValue.code}
                    onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                    className="win-input w-24 text-[11px] font-mono font-bold"
                    placeholder="Código"
                    autoFocus
                  />
                  <input 
                    type="text"
                    value={editValue.name}
                    onChange={(e) => setEditValue({...editValue, name: e.target.value})}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') setEditingNode(null);
                    }}
                    className="win-input flex-1 text-[11px]"
                    placeholder="Nuevo elemento..."
                  />
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

  return (
    <div className={`w-full h-full relative ${isModal ? 'p-0' : 'p-4'}`}>
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#ece9d8] border-2 border-[#0054e3] shadow-lg w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#0054e3] to-[#2670d8] px-3 py-1.5 flex items-center">
              <AlertTriangle className="w-4 h-4 text-white mr-2" />
              <span className="text-white text-[11px] font-bold">Confirmar eliminación</span>
            </div>
            <div className="p-5 flex items-start space-x-4">
              <div className="w-10 h-10 bg-yellow-100 border border-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-slate-800 mb-2">
                  ¿Eliminar "{deleteConfirm.node.code} - {deleteConfirm.node.name}"?
                </p>
                {deleteConfirm.childrenCount > 0 && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 p-2 rounded">
                    ⚠️ Contiene <strong>{deleteConfirm.childrenCount} elemento(s)</strong> hijo(s) que también se eliminarán.
                  </p>
                )}
                <p className="text-[10px] text-slate-500 mt-2">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="bg-[#d4d0c8] px-4 py-3 flex justify-end space-x-2 border-t border-[#808080]">
              <button onClick={handleDeleteConfirmed} className="btn-classic px-5 py-1 text-[10px] font-bold text-red-700 bg-red-50 border-red-300 hover:bg-red-100">
                Sí, eliminar
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-classic px-5 py-1 text-[10px] font-bold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full flex flex-col bg-[#cbd5e0]">
        <div className="bg-[#f3f4f6] border-b border-gray-300 flex items-center px-2 py-1 h-[80px] space-x-1 shrink-0 overflow-x-auto whitespace-nowrap">
          <button onClick={handleNew} className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105">
            <CustomIcon type="Nuevo" />
            <span className="text-[11px] text-gray-700 font-medium mt-1">Nuevo</span>
            <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
          </button>
          <button onClick={() => {
            if (!selectedNode) return;
            const node = findInTree(centers, selectedNode);
            if (node) {
              setEditingNode({ id: node.id, parentId: node.parentId, isNew: false });
              setEditValue({ code: node.code, name: node.name });
            }
          }} className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105">
            <CustomIcon type="Modificar" />
            <span className="text-[11px] text-gray-700 font-medium mt-1">Modificar</span>
            <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
          </button>
          <button onClick={handleDeleteRequest} className="flex flex-col items-center justify-center min-w-[70px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105">
            <CustomIcon type="Eliminar" />
            <span className="text-[11px] text-gray-700 font-medium mt-1">Eliminar</span>
            <ChevronDown className="w-3 h-3 text-gray-400 mt-0.5" />
          </button>
          
          <div className="w-[1px] h-12 bg-gray-300 mx-2"></div>
          
          <button onClick={() => handleMove('up')} className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300">
            <ArrowUp className="w-6 h-6 text-gray-600 mb-1" strokeWidth={1.5} />
            <span className="text-[11px] text-gray-700">Subir</span>
          </button>
          <button onClick={() => handleMove('down')} className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300">
            <ArrowDown className="w-6 h-6 text-gray-600 mb-1" strokeWidth={1.5} />
            <span className="text-[11px] text-gray-700">Bajar</span>
          </button>
          <div className="w-[1px] h-12 bg-gray-300 mx-2"></div>
          
          <button onClick={expandAll} className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105">
            <CustomIcon type="Expandir" />
            <span className="text-[11px] text-gray-700 mt-1">Expandir</span>
          </button>
          <button onClick={collapseAll} className="flex flex-col items-center justify-center min-w-[60px] hover:bg-gray-200/50 p-1 rounded cursor-pointer border border-transparent hover:border-gray-300 transition-transform hover:scale-105">
            <CustomIcon type="Colapsar" />
            <span className="text-[11px] text-gray-700 mt-1">Colapsar</span>
          </button>
          
          {isModal && (
            <>
              <div className="w-[1px] h-12 bg-gray-300 mx-2"></div>
              <button 
                onClick={() => {
                  if (selectedNode && onSelect) {
                    const sel = flatDocs.find(a => a.code === selectedNode);
                    if (sel) {
                      onSelect(sel.code, sel.name);
                    }
                  }
                }}
                className={`flex flex-col items-center justify-center min-w-[70px] p-1 rounded border transition-transform ${selectedNode ? 'hover:bg-blue-100 cursor-pointer border-transparent hover:border-blue-300 hover:scale-105' : 'opacity-50 cursor-not-allowed border-transparent'}`}
                disabled={!selectedNode}
              >
                <Check className={`w-6 h-6 mb-1 ${selectedNode ? 'text-green-600' : 'text-gray-400'}`} strokeWidth={2.5} />
                <span className={`text-[11px] font-bold ${selectedNode ? 'text-blue-800' : 'text-gray-500'}`}>Seleccionar</span>
              </button>
            </>
          )}
        </div>

        <div className="flex-1 flex bg-white border-x border-b border-[#718096] overflow-hidden">
          <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
            {/* Header with Title and Search */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-[#d1d5db] shrink-0 bg-white">
              <span className="text-[12px] text-gray-700 font-semibold uppercase">{title}</span>
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  placeholder="Buscar en el fichero (Alt+B)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[220px] pr-5 py-[2px] text-[11px] text-right border-b border-[#aaa] outline-none focus:border-b-[#4472c4] bg-transparent placeholder:text-[#aaa]"
                />
                <Search size={13} className="absolute right-0 text-[#aaa] pointer-events-none" />
              </div>
            </div>
            {/* Table wrapper */}
            <div className="flex-1 overflow-auto bg-white relative">
              <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#d1d5db] z-10">
                <tr className="text-gray-700">
                  <th className="px-3 py-2 text-left text-[11px] font-normal border-r border-[#d1d5db] uppercase w-48">CÓDIGO</th>
                  <th className="px-3 py-2 text-left text-[11px] font-normal uppercase">DESCRIPCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {editingNode?.isNew && !editingNode.parentId && (
                  <tr className="bg-blue-50 border-b border-blue-300">
                    <td colSpan="2" className="px-3 py-1.5">
                      <div className="flex items-center space-x-1">
                        <input 
                          type="text"
                          value={editValue.code}
                          onChange={(e) => setEditValue({...editValue, code: e.target.value})}
                          className="win-input w-24 text-[11px] font-mono font-bold"
                          placeholder="Código"
                          autoFocus
                        />
                        <input 
                          type="text"
                          value={editValue.name}
                          onChange={(e) => setEditValue({...editValue, name: e.target.value})}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                            if (e.key === 'Escape') setEditingNode(null);
                          }}
                          className="win-input flex-1 text-[11px]"
                          placeholder="Descripción..."
                        />
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
                
                {renderTreeRows(centers, 0)}
                
                {centers.length === 0 && !editingNode && (
                  <tr>
                    <td colSpan="2" className="p-8 text-center text-gray-400 text-sm">
                      No hay {type.toUpperCase()}S creados. Haz clic en "Nuevo" para empezar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
