import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon, BackspaceIcon } from '@heroicons/react/24/outline';
import { setToken } from '../auth';

// @group Constants
const PIN_LENGTH = 4;

// @group Types : PasswordGate props
interface PasswordGateProps {
  darkMode: boolean;
  onUnlock: () => void;
  pinSet: boolean;
  passwordSet: boolean;
}

// @group Component : Full-screen CLI lock screen — supports PIN keypad and password entry
const PasswordGate: React.FC<PasswordGateProps> = ({ onUnlock, pinSet, passwordSet }) => {
  const { t } = useTranslation();
  const [mode,     setMode]     = useState<'pin' | 'password'>(pinSet ? 'pin' : 'password');
  const [pin,      setPin]      = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // @group Handlers : Switch mode and clear state
  const switchMode = (m: 'pin' | 'password') => {
    setMode(m);
    setError('');
    setPin('');
    setPassword('');
  };

  // @group Handlers : Verify PIN against backend
  const verifyPin = async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.token) setToken(json.token);
        onUnlock();
      } else {
        setError(json.error || t('passwordGate.incorrectPin'));
        setPin('');
      }
    } catch {
      setError(t('passwordGate.serverError'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // @group Handlers : Add digit to PIN — auto-submits at PIN_LENGTH
  const addDigit = (digit: string) => {
    if (loading || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === PIN_LENGTH) {
      verifyPin(next);
    }
  };

  // @group Handlers : Keyboard support for PIN mode
  useEffect(() => {
    if (mode !== 'pin') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') addDigit(e.key);
      else if (e.key === 'Backspace') setPin(prev => prev.slice(0, -1));
      else if (e.key === 'Escape')    { setPin(''); setError(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pin, loading]);

  // @group Handlers : Verify password against backend
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.token) setToken(json.token);
        onUnlock();
      } else {
        setError(json.error || t('passwordGate.incorrectPassword'));
        setPassword('');
      }
    } catch {
      setError(t('passwordGate.serverError'));
    } finally {
      setLoading(false);
    }
  };

  // @group Render
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-xs mx-4 bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-7 pb-3 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-[#1a1a1a] border border-[#1e1e1e] mb-4">
            <LockClosedIcon className="h-4 w-4 text-[#888]" />
          </div>
          <h1 className="font-mono text-[11px] font-bold text-[#e8e8e8] uppercase tracking-[0.1em] mb-1">
            EZ PM2 GUI
          </h1>
          <p className="text-[10px] font-mono text-[#555]">
            {mode === 'pin' ? t('passwordGate.enterPin') : t('passwordGate.enterPassword')}
          </p>
        </div>

        {/* Mode toggle — only shown when both PIN and password are configured */}
        {pinSet && passwordSet && (
          <div className="flex mx-5 mb-3 rounded-sm overflow-hidden border border-[#1e1e1e] text-[10px] font-mono">
            <button
              onClick={() => switchMode('pin')}
              className={`flex-1 py-1.5 transition-colors ${
                mode === 'pin'
                  ? 'bg-[#1a1a1a] text-[#e8e8e8]'
                  : 'text-[#555] hover:text-[#888]'
              }`}
            >
              {t('passwordGate.pinMode')}
            </button>
            <button
              onClick={() => switchMode('password')}
              className={`flex-1 py-1.5 transition-colors border-l border-[#1e1e1e] ${
                mode === 'password'
                  ? 'bg-[#1a1a1a] text-[#e8e8e8]'
                  : 'text-[#555] hover:text-[#888]'
              }`}
            >
              {t('passwordGate.passwordMode')}
            </button>
          </div>
        )}

        {/* ── PIN mode ── */}
        {mode === 'pin' && (
          <div className="px-6 pb-7">
            {/* Dot indicators */}
            <div className="flex justify-center gap-4 mb-5 mt-1">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full border transition-all duration-100 ${
                    i < pin.length
                      ? 'bg-[#22c55e] border-[#22c55e]'
                      : 'bg-[#1a1a1a] border-[#333]'
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-[10px] font-mono text-[#ef4444] text-center mb-3 -mt-1">{error}</p>
            )}

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => addDigit(d)}
                  disabled={loading}
                  className="py-3.5 bg-[#141414] border border-[#1e1e1e] rounded-sm font-mono text-[#e8e8e8] text-sm font-semibold hover:bg-[#1a1a1a] transition-colors select-none disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              {/* Bottom row: clear | 0 | backspace */}
              <button
                onClick={() => { setPin(''); setError(''); }}
                disabled={loading}
                className="py-3.5 rounded-sm font-mono text-[10px] text-[#555] hover:text-[#888] transition-colors select-none disabled:opacity-40"
              >
                {t('passwordGate.clear')}
              </button>
              <button
                onClick={() => addDigit('0')}
                disabled={loading}
                className="py-3.5 bg-[#141414] border border-[#1e1e1e] rounded-sm font-mono text-[#e8e8e8] text-sm font-semibold hover:bg-[#1a1a1a] transition-colors select-none disabled:opacity-40"
              >
                0
              </button>
              <button
                onClick={() => { setPin(prev => prev.slice(0, -1)); setError(''); }}
                disabled={loading || pin.length === 0}
                className="py-3.5 rounded-sm flex items-center justify-center text-[#555] hover:text-[#888] transition-colors select-none disabled:opacity-30"
              >
                <BackspaceIcon className="h-4 w-4" />
              </button>
            </div>

            {loading && (
              <p className="text-[10px] font-mono text-[#555] text-center mt-3">
                {t('passwordGate.verifying')}
              </p>
            )}
          </div>
        )}

        {/* ── Password mode ── */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="px-6 pb-7 space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('passwordGate.passwordPlaceholder')}
              autoFocus
              className={`w-full bg-[#0d0d0d] border text-[#e8e8e8] font-mono text-xs rounded-sm px-3 py-2 outline-none transition-colors placeholder:text-[#555] focus:border-[#555] ${
                error ? 'border-[#ef4444]' : 'border-[#1e1e1e]'
              }`}
            />
            {error && (
              <p className="text-[10px] font-mono text-[#ef4444]">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-2 rounded-sm w-full hover:bg-[#d0d0d0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('passwordGate.verifying') : t('passwordGate.unlock')}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default PasswordGate;
