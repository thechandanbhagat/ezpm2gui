import React, { useState, useEffect } from 'react';
import { LockClosedIcon, BackspaceIcon } from '@heroicons/react/24/outline';

// @group Constants
const PIN_LENGTH = 4;

// @group Types : PasswordGate props
interface PasswordGateProps {
  darkMode: boolean;
  onUnlock: () => void;
  pinSet: boolean;
  passwordSet: boolean;
}

// @group Component : Full-screen lock screen — supports PIN keypad and password entry
const PasswordGate: React.FC<PasswordGateProps> = ({ darkMode, onUnlock, pinSet, passwordSet }) => {
  // Default to PIN mode when PIN is configured
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
        onUnlock();
      } else {
        setError(json.error || 'Incorrect PIN');
        setPin('');
      }
    } catch {
      setError('Could not reach the server.');
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
        onUnlock();
      } else {
        setError(json.error || 'Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  // @group Styles
  const bg          = darkMode ? 'bg-neutral-950'  : 'bg-neutral-100';
  const cardBg      = darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200';
  const textPrimary = darkMode ? 'text-neutral-100' : 'text-neutral-900';
  const textMuted   = darkMode ? 'text-neutral-500' : 'text-neutral-500';
  const digitBtn    = darkMode ? 'bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-100' : 'bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-900';

  // @group Render
  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${bg}`}>
      <div className={`w-full max-w-xs mx-4 rounded-xl border shadow-2xl overflow-hidden ${cardBg}`}>

        {/* Header */}
        <div className="px-6 pt-7 pb-3 text-center">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary-600/10 mb-3">
            <LockClosedIcon className="h-5 w-5 text-primary-500" />
          </div>
          <h1 className={`text-sm font-semibold mb-0.5 ${textPrimary}`}>EZ PM2 GUI</h1>
          <p className={`text-xs ${textMuted}`}>
            {mode === 'pin' ? 'Enter your PIN to continue' : 'Enter your password to continue'}
          </p>
        </div>

        {/* Mode toggle — only shown when both PIN and password are configured */}
        {pinSet && passwordSet && (
          <div className={`flex mx-5 mb-3 rounded-lg overflow-hidden border text-xs font-medium ${darkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
            <button
              onClick={() => switchMode('pin')}
              className={`flex-1 py-1.5 transition-colors ${
                mode === 'pin'
                  ? 'bg-primary-600 text-white'
                  : darkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              PIN
            </button>
            <button
              onClick={() => switchMode('password')}
              className={`flex-1 py-1.5 transition-colors ${
                mode === 'password'
                  ? 'bg-primary-600 text-white'
                  : darkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Password
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
                  className={`w-3 h-3 rounded-full border-2 transition-all duration-100 ${
                    i < pin.length
                      ? 'bg-primary-500 border-primary-500 scale-110'
                      : darkMode ? 'border-neutral-600' : 'border-neutral-300'
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500 text-center mb-3 -mt-1">{error}</p>
            )}

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => addDigit(d)}
                  disabled={loading}
                  className={`py-3.5 rounded-lg text-base font-semibold transition-colors select-none disabled:opacity-40 ${digitBtn}`}
                >
                  {d}
                </button>
              ))}
              {/* Bottom row: clear | 0 | backspace */}
              <button
                onClick={() => { setPin(''); setError(''); }}
                disabled={loading}
                className={`py-3.5 rounded-lg text-xs font-medium transition-colors select-none disabled:opacity-40 ${textMuted} ${darkMode ? 'hover:text-neutral-300' : 'hover:text-neutral-600'}`}
              >
                Clear
              </button>
              <button
                onClick={() => addDigit('0')}
                disabled={loading}
                className={`py-3.5 rounded-lg text-base font-semibold transition-colors select-none disabled:opacity-40 ${digitBtn}`}
              >
                0
              </button>
              <button
                onClick={() => { setPin(prev => prev.slice(0, -1)); setError(''); }}
                disabled={loading || pin.length === 0}
                className={`py-3.5 rounded-lg flex items-center justify-center transition-colors select-none disabled:opacity-30 ${textMuted} ${darkMode ? 'hover:text-neutral-200' : 'hover:text-neutral-700'}`}
              >
                <BackspaceIcon className="h-5 w-5" />
              </button>
            </div>

            {loading && <p className={`text-xs text-center mt-3 ${textMuted}`}>Verifying…</p>}
          </div>
        )}

        {/* ── Password mode ── */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="px-6 pb-7 space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
                darkMode
                  ? 'bg-neutral-800 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:border-primary-500'
                  : 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-primary-500'
              } ${error ? 'border-red-500' : ''}`}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {loading ? 'Verifying…' : 'Unlock'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default PasswordGate;
