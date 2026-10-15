import React, { useState, useEffect, useRef } from 'react';

export default function ResizableSidebar({ children, defaultWidth = 256, minWidth = 150, maxWidth = 500, className = "", position = "left" }) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar_width');
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  
  const resizeState = useRef({ isResizing: false, startX: 0, startWidth: 0 });

  useEffect(() => {
    localStorage.setItem('sidebar_width', width);
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizeState.current.isResizing) return;
      const delta = e.clientX - resizeState.current.startX;
      let newWidth = position === "left" 
        ? resizeState.current.startWidth + delta 
        : resizeState.current.startWidth - delta;
        
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (resizeState.current.isResizing) {
        resizeState.current.isResizing = false;
        document.body.style.cursor = 'default';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minWidth, maxWidth, position]);

  return (
    <div 
      style={{ width }} 
      className={`relative shrink-0 flex flex-col transition-none ${className}`}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <div 
        className={`absolute top-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 group transition-colors ${position === "left" ? "right-0" : "left-0"}`}
        onMouseDown={(e) => {
          e.preventDefault();
          resizeState.current = {
            isResizing: true,
            startX: e.clientX,
            startWidth: width
          };
          document.body.style.cursor = 'col-resize';
        }}
      >
        <div className={`absolute inset-y-0 w-3 ${position === "left" ? "-left-1" : "-right-1"}`} /> {/* Wider hit area */}
      </div>
    </div>
  );
}
