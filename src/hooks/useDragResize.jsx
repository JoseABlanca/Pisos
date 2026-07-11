import { useState, useRef, useEffect } from 'react';

export function useDragResize({ initW, initH, minW = 200, minH = 150, storageKey = null }) {
  // Inicializar estado desde localStorage si existe
  const [pos, setPos] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`${storageKey}_pos`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return parsed;
          }
        } catch (e) {}
      }
    }
    return { x: Math.max(0, (window.innerWidth - initW) / 2), y: Math.max(20, (window.innerHeight - initH) / 2 - 40) };
  });

  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`${storageKey}_size`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.w === 'number' && typeof parsed.h === 'number') {
            return parsed;
          }
        } catch (e) {}
      }
    }
    return { w: initW, h: initH };
  });

  const drag = useRef({ active: false, ox: 0, oy: 0 });
  const resize = useRef({ active: false, dir: '', sx: 0, sy: 0, sw: 0, sh: 0, sl: 0, st: 0 });

  // Refs to hold current pos and size for the mouseup handlers
  const currentPos = useRef(pos);
  const currentSize = useRef(size);

  useEffect(() => { currentPos.current = pos; }, [pos]);
  useEffect(() => { currentSize.current = size; }, [size]);

  const onDragDown = e => {
    e.preventDefault();
    drag.current = { active: true, ox: e.clientX - currentPos.current.x, oy: e.clientY - currentPos.current.y };
    
    const up = () => { 
      drag.current.active = false; 
      window.removeEventListener('mouseup', up); 
      window.removeEventListener('mousemove', mv); 
      
      // Guardar en localStorage al terminar el drag
      if (storageKey) {
        localStorage.setItem(`${storageKey}_pos`, JSON.stringify(currentPos.current));
      }
    };
    
    const mv = e => { 
      if (drag.current.active) {
        setPos({ x: e.clientX - drag.current.ox, y: e.clientY - drag.current.oy }); 
      }
    };
    
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', mv);
  };

  const onResizeDown = (e, dir) => {
    e.preventDefault(); e.stopPropagation();
    resize.current = { active: true, dir, sx: e.clientX, sy: e.clientY, sw: currentSize.current.w, sh: currentSize.current.h, sl: currentPos.current.x, st: currentPos.current.y };
    
    const up = () => { 
      resize.current.active = false; 
      window.removeEventListener('mouseup', up); 
      window.removeEventListener('mousemove', mv); 
      
      // Guardar en localStorage al terminar el resize
      if (storageKey) {
        localStorage.setItem(`${storageKey}_size`, JSON.stringify(currentSize.current));
        localStorage.setItem(`${storageKey}_pos`, JSON.stringify(currentPos.current));
      }
    };
    
    const mv = e => {
      if (!resize.current.active) return;
      const r = resize.current;
      const dx = e.clientX - r.sx;
      const dy = e.clientY - r.sy;
      let nw = r.sw, nh = r.sh, nx = r.sl, ny = r.st;
      if (r.dir.includes('e')) nw = Math.max(minW, r.sw + dx);
      if (r.dir.includes('s')) nh = Math.max(minH, r.sh + dy);
      if (r.dir.includes('w')) { nw = Math.max(minW, r.sw - dx); if (nw > minW) nx = r.sl + dx; }
      if (r.dir.includes('n')) { nh = Math.max(minH, r.sh - dy); if (nh > minH) ny = r.st + dy; }
      setSize({ w: nw, h: nh });
      setPos({ x: nx, y: ny });
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', mv);
  };

  const resizeHandles = (
    <>
      {/* Edges */}
      <div onMouseDown={e => onResizeDown(e, 'n')} className="absolute top-0 left-[6px] right-[6px] h-[5px] cursor-n-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 's')} className="absolute bottom-0 left-[6px] right-[6px] h-[5px] cursor-s-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 'w')} className="absolute left-0 top-[6px] bottom-[6px] w-[5px] cursor-w-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 'e')} className="absolute right-0 top-[6px] bottom-[6px] w-[5px] cursor-e-resize select-none" />
      {/* Corners */}
      <div onMouseDown={e => onResizeDown(e, 'nw')} className="absolute top-0 left-0 w-[6px] h-[6px] cursor-nw-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 'ne')} className="absolute top-0 right-0 w-[6px] h-[6px] cursor-ne-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 'sw')} className="absolute bottom-0 left-0 w-[6px] h-[6px] cursor-sw-resize select-none" />
      <div onMouseDown={e => onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-[6px] h-[6px] cursor-se-resize select-none" />
    </>
  );

  return { pos, size, onDragDown, onResizeDown, resizeHandles };
}
