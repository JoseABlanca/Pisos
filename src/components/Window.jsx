import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minus, Square } from 'lucide-react';

const RESIZE_EDGE = 6; // pixels for resize handle area
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

export default function Window({ title, children, onClose, width = '800px', height = 'auto', initialPos = { x: 50, y: 50 }, className = "", menuItems, onMenuClick }) {
  const [pos, setPos] = useState(initialPos);
  const [size, setSize] = useState({ 
    width: parseInt(width) || 800, 
    height: height === 'auto' ? null : (parseInt(height) || 600) 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState(null); // 'n','s','e','w','ne','nw','se','sw'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState(null); // saved pos+size before maximize

  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, left: 0, top: 0 });
  const windowRef = useRef(null);

  // ---- Drag (title bar) ----
  const handleTitleMouseDown = (e) => {
    if (e.target.closest('button')) return;
    if (isMaximized) return; // don't drag when maximized
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      setPos({
        x: e.clientX - dragStartPos.current.x,
        y: Math.max(0, e.clientY - dragStartPos.current.y)
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // ---- Resize (edges & corners) ----
  const handleResizeStart = useCallback((e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDir(direction);
    const rect = windowRef.current?.getBoundingClientRect();
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: rect?.width || size.width,
      h: rect?.height || size.height || 500,
      left: pos.x,
      top: pos.y
    };
  }, [pos, size]);

  useEffect(() => {
    if (!isResizing || !resizeDir) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      const { w, h, left, top } = resizeStart.current;

      let newW = w, newH = h, newLeft = left, newTop = top;

      // East
      if (resizeDir.includes('e')) {
        newW = Math.max(MIN_WIDTH, w + dx);
      }
      // West
      if (resizeDir.includes('w')) {
        const proposedW = w - dx;
        if (proposedW >= MIN_WIDTH) {
          newW = proposedW;
          newLeft = left + dx;
        }
      }
      // South
      if (resizeDir.includes('s')) {
        newH = Math.max(MIN_HEIGHT, h + dy);
      }
      // North
      if (resizeDir.includes('n')) {
        const proposedH = h - dy;
        if (proposedH >= MIN_HEIGHT) {
          newH = proposedH;
          newTop = top + dy;
        }
      }

      setSize({ width: newW, height: newH });
      setPos({ x: newLeft, y: Math.max(0, newTop) });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDir(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeDir]);

  // ---- Maximize / Restore ----
  const handleMaximize = () => {
    if (isMaximized) {
      // Restore
      if (preMaxState) {
        setPos(preMaxState.pos);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
    } else {
      // Save current state and maximize
      setPreMaxState({ pos: { ...pos }, size: { ...size } });
      setPos({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setIsMaximized(true);
    }
  };

  // ---- Cursor for resize direction ----
  const getCursor = (dir) => {
    const map = {
      n: 'ns-resize', s: 'ns-resize',
      e: 'ew-resize', w: 'ew-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
      nw: 'nwse-resize', se: 'nwse-resize'
    };
    return map[dir] || 'default';
  };

  const resizeHandles = [
    { dir: 'n',  style: { top: 0, left: RESIZE_EDGE, right: RESIZE_EDGE, height: RESIZE_EDGE } },
    { dir: 's',  style: { bottom: 0, left: RESIZE_EDGE, right: RESIZE_EDGE, height: RESIZE_EDGE } },
    { dir: 'e',  style: { top: RESIZE_EDGE, right: 0, bottom: RESIZE_EDGE, width: RESIZE_EDGE } },
    { dir: 'w',  style: { top: RESIZE_EDGE, left: 0, bottom: RESIZE_EDGE, width: RESIZE_EDGE } },
    { dir: 'nw', style: { top: 0, left: 0, width: RESIZE_EDGE, height: RESIZE_EDGE } },
    { dir: 'ne', style: { top: 0, right: 0, width: RESIZE_EDGE, height: RESIZE_EDGE } },
    { dir: 'sw', style: { bottom: 0, left: 0, width: RESIZE_EDGE, height: RESIZE_EDGE } },
    { dir: 'se', style: { bottom: 0, right: 0, width: RESIZE_EDGE, height: RESIZE_EDGE } },
  ];

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={windowRef}
      style={{
        position: (isMaximized || isMobile) ? 'fixed' : 'absolute',
        left: isMobile ? '0' : `${pos.x}px`,
        top: isMobile ? '0' : `${pos.y}px`,
        width: isMobile ? '100%' : `${size.width}px`,
        height: isMobile ? '100%' : (size.height ? `${size.height}px` : 'auto'),
        zIndex: isDragging || isResizing ? 1000 : 100,
      }}
      className={`win-window flex flex-col shadow-lg border-2 border-[#808080] bg-white select-none ${className}`}
    >
      {/* Resize Handles */}
      {!isMaximized && resizeHandles.map(({ dir, style }) => (
        <div
          key={dir}
          onMouseDown={(e) => handleResizeStart(e, dir)}
          style={{ ...style, position: 'absolute', zIndex: 10, cursor: getCursor(dir) }}
        />
      ))}

      {/* Title Bar */}
      <div 
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={handleMaximize}
        className="window-title-bar flex justify-between items-center px-3 py-1.5 border-b border-gray-300 bg-white cursor-default h-8 relative"
      >
        <div className="flex items-center space-x-2">
          {/* Menu Button / Icon */}
          <button 
            onPointerDown={(e) => { 
               e.preventDefault();
               e.stopPropagation(); 
               if (onMenuClick) {
                 onMenuClick();
               } else {
                 setIsMobileMenuOpen(!isMobileMenuOpen); 
               }
            }}
            className="w-5 h-5 flex flex-wrap gap-[1px] hover:opacity-80 focus:outline-none"
            title="Menú"
          >
            {[...Array(9)].map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 border border-gray-400 ${[0, 1, 3, 4].includes(i) ? 'bg-gray-200' : 'bg-transparent'}`}></div>
            ))}
          </button>
          <span className="text-[12px] font-normal text-gray-800 tracking-wide truncate pr-4">{title}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button className="text-gray-500 hover:text-gray-800 focus:outline-none"><Minus className="w-4 h-4" /></button>
          <button onClick={handleMaximize} className="text-gray-500 hover:text-gray-800 focus:outline-none">
            <Square className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-red-600 focus:outline-none ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isMobileMenuOpen && (
        <>
          <div className="absolute inset-0 top-8 bg-black/20 backdrop-blur-sm z-40" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="absolute top-8 bottom-0 left-0 w-48 bg-[#f0f4f9] border-r border-gray-300 shadow-2xl z-50 text-slate-800 text-[12px] flex flex-col pb-2 overflow-y-auto">
          {menuItems ? menuItems.map((item, idx) => (
            <div 
              key={idx} 
              className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" 
              onClick={() => { item.onClick(); setIsMobileMenuOpen(false); }}
            >
              {item.label}
            </div>
          )) : (
            <>
              <div className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>Contabilidad</div>
              <div className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>Inversiones inmobiliarias</div>
              <div className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>Informes</div>
              <div className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>Herramientas</div>
              <div className="px-4 py-2 hover:bg-[#d0d0d0] cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>Ayuda</div>
            </>
          )}
        </div>
        </>
      )}
      
      {/* Window Body */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        <div className="h-full overflow-auto bg-white flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
