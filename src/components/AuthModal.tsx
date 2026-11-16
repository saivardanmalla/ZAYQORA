import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (roleCode: string) => void;
}

const DEMO_PERSONAS = [
  {
    label: 'Restaurant Owner — Saffron & Hearth',
    email: 'owner@saffronhearth.demo',
    role: 'RESTAURANT_OWNER',
    dest: '/dashboard',
  },
  {
    label: 'Head Chef — Kitchen Display System',
    email: 'chef@saffronhearth.demo',
    role: 'CHEF',
    dest: '/kds',
  },
  {
    label: 'VIRELEO Platform Super Admin',
    email: 'superadmin@vireleo.io',
    role: 'PLATFORM_SUPER_ADMIN',
    dest: '/admin',
  },
  {
    label: 'Diner / Customer Account',
    email: 'customer@zayqora.demo',
    role: 'CUSTOMER',
    dest: '/r/saffron-hearth',
  },
];

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { login, register, demoLogin } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState<'CUSTOMER' | 'RESTAURANT_OWNER'>('CUSTOMER');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(fullName, email, password, roleCode);
      onSuccess?.(user.roleCode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async (demoEmail: string, dest: string) => {
    setError('');
    setSubmitting(true);
    try {
      const user = await demoLogin(demoEmail);
      onSuccess?.(dest || user.roleCode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1426]/70 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-[#101D35] rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">ZAYQORA Access &amp; Identity</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Role-based authentication by VIRELEO</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Segmented Mode Toggle */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#101D35] text-[#101D35] dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#101D35] dark:hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-[#101D35] text-[#101D35] dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#101D35] dark:hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Account Type</label>
                  <select
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value as 'CUSTOMER' | 'RESTAURANT_OWNER')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  >
                    <option value="CUSTOMER">Diner / Customer</option>
                    <option value="RESTAURANT_OWNER">Restaurant Owner</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@restaurant.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Transparent Demo Persona Explorer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
              <ShieldCheck className="w-4 h-4 text-[#0D9488]" />
              <span>Demo Workspace Explorer (Seeded Demo Data)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_PERSONAS.map((persona) => (
                <button
                  key={persona.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDemo(persona.email, persona.dest)}
                  className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#0D9488] hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-[#101D35] dark:text-slate-100 truncate">{persona.label}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-data truncate mt-0.5">{persona.role}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
