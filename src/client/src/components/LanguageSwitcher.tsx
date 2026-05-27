import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

interface LanguageSwitcherProps {
  darkMode: boolean;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ne', label: 'नेपाली' },
  // To add a new language: see DEVELOPMENT.md § "Adding a New Language"
];

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ darkMode }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  const select = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('ezpm2gui-language', code);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={current.label}
        className={`flex items-center gap-1 p-1 rounded transition-colors text-xs ${
          darkMode
            ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
        }`}
      >
        <GlobeAltIcon className="h-4 w-4" />
        <span className="hidden sm:inline font-medium">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-1 w-32 rounded-lg border shadow-lg z-[200] overflow-hidden ${
          darkMode
            ? 'bg-neutral-900 border-neutral-700'
            : 'bg-white border-neutral-200'
        }`}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => select(lang.code)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                lang.code === i18n.language
                  ? darkMode
                    ? 'bg-primary-600/20 text-primary-400 font-medium'
                    : 'bg-primary-50 text-primary-700 font-medium'
                  : darkMode
                    ? 'text-neutral-300 hover:bg-neutral-800'
                    : 'text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
