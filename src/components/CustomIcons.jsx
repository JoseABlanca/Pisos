export const CustomIcon = ({ type }) => {
  switch (type) {
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
    case 'Expandir':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6 8 L 12 8 L 14 12 L 26 12 L 26 24 L 6 24 Z" fill="#fde047" stroke="#ea580c" strokeWidth="1.5"/>
          <path d="M 4 14 L 28 14 L 26 26 L 6 26 Z" fill="#fef08a" stroke="#ea580c" strokeWidth="1.5"/>
          <rect x="18" y="16" width="12" height="12" fill="white" stroke="#555" strokeWidth="1.2"/>
          <path d="M 20 22 L 23 25 L 28 18" stroke="#16a34a" strokeWidth="2.5" fill="none"/>
        </svg>
      );
    case 'Colapsar':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6 8 L 12 8 L 14 12 L 26 12 L 26 26 L 6 26 Z" fill="#fef08a" stroke="#ea580c" strokeWidth="1.5"/>
          <rect x="18" y="16" width="12" height="12" fill="white" stroke="#555" strokeWidth="1.2"/>
          <line x1="20" y1="22" x2="28" y2="22" stroke="#ef4444" strokeWidth="2.5"/>
        </svg>
      );
    default:
      return null;
  }
};
