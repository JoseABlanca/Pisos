import { useOutletContext } from 'react-router-dom';

export default function ZoomControl() {
  const context = useOutletContext();
  
  if (!context || !context.setTableZoom) return null;

  const { tableZoom, setTableZoom } = context;

  return (
    <div className="flex items-center space-x-1 opacity-70 hover:opacity-100 transition-opacity">
      <button onClick={() => setTableZoom(z => Math.max(0.5, z - 0.1))} className="text-lg px-1 hover:text-black text-gray-600 leading-none">−</button>
      <input 
        type="range" 
        min="0.5" 
        max="2" 
        step="0.1" 
        value={tableZoom} 
        onChange={(e) => setTableZoom(Number(e.target.value))}
        className="w-20 accent-gray-500 h-1 bg-gray-300 appearance-none cursor-pointer rounded-full"
      />
      <button onClick={() => setTableZoom(z => Math.min(2, z + 0.1))} className="text-lg px-1 hover:text-black text-gray-600 leading-none">+</button>
    </div>
  );
}
