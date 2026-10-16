import { useState, useEffect, useRef } from 'react';

export default function EditableCell({ value, onSave, className = '', type = 'text', options = null, children }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (val !== value && onSave) {
      onSave(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (val !== value && onSave) {
        onSave(val);
      }
    } else if (e.key === 'Escape') {
      setVal(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    if (options) {
      return (
        <td className={`${className} !p-0`} onClick={(e) => e.stopPropagation()}>
          <select
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:bg-transparent focus:shadow-none text-[11px] font-sans px-1 cursor-pointer"
          >
            {options.map((o) => {
              if (typeof o === 'object' && o !== null) {
                return (
                  <option key={o.value || o.id} value={o.value || o.id}>
                    {o.label || o.name || o.value || o.id}
                  </option>
                );
              }
              return (
                <option key={o} value={o}>
                  {o}
                </option>
              );
            })}
          </select>
        </td>
      );
    }

    return (
      <td className={`${className} !p-0`} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type={type}
          value={val ?? ''}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full h-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:bg-transparent focus:shadow-none text-[11px] font-mono px-1 py-0.5"
        />
      </td>
    );
  }

  // Display value
  let displayVal = value;
  if (value === null || value === undefined || value === '') {
    displayVal = '---';
  } else if (options) {
    const matched = options.find((o) => typeof o === 'object' && o !== null && (o.id === value || o.value === value));
    if (matched) {
      displayVal = matched.label || matched.name;
    }
  }

  return (
    <td
      className={`${className} cursor-pointer select-none`}
      onDoubleClick={(e) => {
        if (onSave) {
          e.stopPropagation();
          setIsEditing(true);
        }
      }}
    >
      {children !== undefined ? children : String(displayVal)}
    </td>
  );
}
