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
    if (val !== value) {
      onSave(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (val !== value) {
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
        <td className={className} onClick={(e) => e.stopPropagation()}>
          <select
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-white border border-[#000080] text-[11px] font-sans px-1 outline-none cursor-pointer h-5"
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
      <td className={className} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type={type}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-[#000080] text-[11px] font-mono px-1 py-0.5 outline-none h-5"
        />
      </td>
    );
  }

  // Display value
  let displayVal = value;
  if (value === null || value === undefined || value === '') {
    displayVal = '---';
  } else if (options) {
    // If it's a dropdown, look up the label for display
    const matched = options.find((o) => typeof o === 'object' && o !== null && (o.id === value || o.value === value));
    if (matched) {
      displayVal = matched.label || matched.name;
    }
  }

  return (
    <td
      className={`${className} cursor-pointer select-none`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {children !== undefined ? children : String(displayVal)}
    </td>
  );
}
