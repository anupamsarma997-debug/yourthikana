import React, { useState } from 'react';
import { store } from '../services/store';
import { auth } from '../lib/firebase';
import { User, UserRole } from '../types';
import { 
  Building2, 
  Sparkles, 
  Sun, 
  Moon, 
  Smartphone, 
  UserCheck, 
  ShieldCheck, 
  PlusCircle, 
  MessageSquare,
  LogOut,
  MapPin,
  HelpCircle,
  Menu,
  X
} from 'lucide-react';

interface NavbarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onOpenAuth: () => void;
  onOpenAI: () => void;
  onOpenAddProperty: () => void;
  onSelectCity: (city: string) => void;
  selectedCity: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onRoleChange,
  onOpenAuth,
  onOpenAI,
  onOpenAddProperty,
  onSelectCity,
  selectedCity,
}) => {
  const [user, setUser] = useState<User | undefined>(store.getCurrentUser());
  const isVerifiedPlatformOwner = Boolean(
    auth?.currentUser?.emailVerified &&
    auth.currentUser.email?.trim().toLowerCase() === 'anupamsarma997@gmail.com'
  );
  const [isDark, setIsDark] = useState<boolean>(store.getTheme());
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(store.getMobileFrame());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    return store.subscribe(() => {
      setUser(store.getCurrentUser());
      setIsDark(store.getTheme());
      setIsMobileFrame(store.getMobileFrame());
    });
  }, []);

  const POPULAR_CITIES = [
    'All Locations', 
    'Guwahati', 
    'Kaziranga', 
    'Shillong', 
    'Cherrapunji', 
    'Gangtok', 
    'Tawang', 
    'Kohima', 
    'Majuli Island', 
    'Dawki', 
    'Ziro Valley', 
    'Aizawl', 
    'Imphal', 
    'Agartala'
  ];

  const handleToggleTheme = () => {
    store.toggleTheme();
  };

  const handleToggleFrame = () => {
    store.toggleMobileFrame();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white text-xs py-1.5 px-4 text-center font-semibold flex items-center justify-center gap-2 shadow-inner">
        <span className="bg-amber-400 text-slate-950 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-extrabold">Northeast India</span>
        <span>Connect directly with Assam, Meghalaya, Sikkim, Nagaland & Arunachal Homestay Hosts via WhatsApp! Zero middleman fees.</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onRoleChange('customer')}
              className="flex items-center gap-2 group text-left cursor-pointer focus:outline-none"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform">
                T
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
                    THIKANA
                  </span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-700">
                    Northeast
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Seven Sisters & Sikkim Homestay Portal
                </p>
              </div>
            </button>

            {/* Quick City Dropdown */}
            <div className="hidden lg:flex items-center ml-4 pl-4 border-l border-slate-200 dark:border-slate-800">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mr-1" />
              <select
                value={selectedCity}
                onChange={(e) => onSelectCity(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
              >
                {POPULAR_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role Switcher Tabs */}
          <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            <button
              onClick={() => onRoleChange('customer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentRole === 'customer'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Customer View
            </button>
            <button
              onClick={() => onRoleChange('owner')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentRole === 'owner'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Owner Panel
            </button>
            {(user?.role === 'admin' || isVerifiedPlatformOwner) && (
              <button
                onClick={() => onRoleChange('admin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  currentRole === 'admin'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin Panel
              </button>
            )}
          </div>

          {/* Action Tools & User Menu */}
          <div className="flex items-center gap-2">
            
            {/* AI Assistant Button */}
            <button
              onClick={onOpenAI}
              className="hidden sm:flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-xl hover:opacity-90 transition-all shadow-sm"
              title="THIKANA AI Mitra Travel Assistant"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Guide</span>
            </button>

            {/* Add Property Button (Always Accessible) */}
            <button
              onClick={onOpenAddProperty}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-md hover:scale-105 cursor-pointer shrink-0"
              title="List your Homestay or Hotel directly on THIKANA"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Property</span>
            </button>

            {/* Mobile View Toggle */}
            <button
              onClick={handleToggleFrame}
              className={`p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                isMobileFrame ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : ''
              }`}
              type="button"
              aria-label="Toggle mobile preview frame"
              aria-pressed={isMobileFrame}
              title="Toggle Mobile App Mockup Frame View"
            >
              <Smartphone className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={handleToggleTheme}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              type="button"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={isDark}
              title="Toggle Dark/Light Mode"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Account / Auth */}
            <div className="pl-2 border-l border-slate-200 dark:border-slate-800 flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="text-right hidden xl:block">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium capitalize">
                      {user.role} Account
                    </p>
                  </div>
                  <button
                    onClick={onOpenAuth}
                    aria-label="Open account settings"
                    className="min-w-11 min-h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-emerald-500 transition-all overflow-hidden"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenAuth}
                  className="text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3.5 py-1.5 rounded-xl hover:opacity-90 transition-all shadow-sm"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch Portal</p>
            <div className={`grid ${user?.role === 'admin' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
              <button
                onClick={() => { onRoleChange('customer'); setMobileMenuOpen(false); }}
                className={`px-2 py-1.5 text-center text-xs font-medium rounded-lg ${currentRole === 'customer' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                Customer
              </button>
              <button
                onClick={() => { onRoleChange('owner'); setMobileMenuOpen(false); }}
                className={`px-2 py-1.5 text-center text-xs font-medium rounded-lg ${currentRole === 'owner' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                Owner
              </button>
              {(user?.role === 'admin' || isVerifiedPlatformOwner) && (
                <button
                  onClick={() => { onRoleChange('admin'); setMobileMenuOpen(false); }}
                  className={`px-2 py-1.5 text-center text-xs font-medium rounded-lg ${currentRole === 'admin' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                >
                  Admin
                </button>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <button
              onClick={() => { onOpenAddProperty(); setMobileMenuOpen(false); }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ List & Add New Property</span>
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { onOpenAI(); setMobileMenuOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Travel Guide</span>
              </button>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="w-3.5 h-3.5" />
                <span>{selectedCity}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
