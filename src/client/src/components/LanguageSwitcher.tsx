import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

// @group Types : Component props
interface LanguageSwitcherProps {
  darkMode: boolean;
}

// @group Constants : Supported languages
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ne', label: 'नेपाली' },
  // To add a new language: see DEVELOPMENT.md § "Adding a New Language"
];

// @group LanguageSwitcher : Locale selector dropdown in the nav bar
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  // @group Handlers : Language selection and outside-click close
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

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={current.label}
        className="flex items-center gap-1 p-1 rounded-sm transition-colors font-mono text-[10px] text-[#555] hover:text-[#888]"
      >
        <GlobeAltIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{current.code.toUpperCase()}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-[#111] border border-[#1e1e1e] rounded-sm z-[200] overflow-hidden">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => select(lang.code)}
              className={`w-full text-left px-3 py-1.5 font-mono text-[10px] transition-colors hover:bg-[#1a1a1a]
                ${lang.code === i18n.language
                  ? 'text-[#e8e8e8]'
                  : 'text-[#888] hover:text-[#e8e8e8]'
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
