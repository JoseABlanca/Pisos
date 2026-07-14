import React, { useState, useEffect, useRef } from 'react';

export default function ResizableSidebar({ children, defaultWidth = 256, minWidth = 150, maxWidth = 500, className = "" }) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar_width');
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      let newWidth = e.clientX;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        localStorage.setItem('sidebar_width', width); // Using state in effect dependency can be tricky, but we just save in mouse up. Actually better to save in move or just update localstorage during move.
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minWidth, maxWidth, width]);

  return (
    <div 
      style={{ width }} 
      className={`relative shrink-0 flex flex-col transition-none ${className}`}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <div 
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 group transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          isResizing.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      >
        <div className="absolute inset-y-0 -left-1 w-3" /> {/* Wider hit area */}
      </div>
    </div>
  );
}
