import React from 'react';
import { UserRole } from '../types';
import { Building2, MessageCircle, ShieldCheck } from 'lucide-react';
import { store } from '../services/store';

interface FooterProps {
  onRoleChange: (role: UserRole) => void;
  onOpenAddProperty: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onRoleChange, onOpenAddProperty }) => {
  const currentUser = store.getCurrentUser();
  return (
    <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Banner callout for owners */}
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-6 rounded-3xl border border-emerald-500/30 mb-10 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <span className="bg-emerald-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-md">
                Hotel & Homestay Owners
              </span>
              <h4 className="text-lg font-black text-white mt-1">
                List Your Property on THIKANA for ₹1000–₹1500/month
              </h4>
              <p className="text-xs text-slate-300">
                Receive 100% direct guest enquiries on WhatsApp with ZERO commission or hidden fees!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                onRoleChange('owner');
                onOpenAddProperty();
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Add Property Now
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-800 text-xs">
          {/* Brand Col */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 font-extrabold text-lg flex items-center justify-center">
                T
              </div>
              <span className="text-lg font-black text-white tracking-tight">THIKANA</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              India's premier Zero Commission WhatsApp-First Hotel & Homestay Marketplace. Connecting travelers directly with authentic local hosts.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800 w-fit">
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Direct WhatsApp Bookings</span>
            </div>
          </div>

          {/* Popular Northeast Destinations */}
          <div>
            <h5 className="font-extrabold text-white uppercase tracking-wider mb-3 text-[11px]">
              Top Northeast Destinations
            </h5>
            <ul className="space-y-2 text-slate-400">
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Kaziranga National Park (Assam)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Sohra & Cherrapunji (Meghalaya)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Tawang Monastery Stays (Arunachal)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Majuli Island Mishing Homestays (Assam)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Gangtok & Sikkim Eco Stays (Sikkim)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Dzukou Valley & Kohima (Nagaland)</li>
              <li className="hover:text-emerald-400 cursor-pointer transition-colors">Shillong Pine Hills (Meghalaya)</li>
            </ul>
          </div>

          {/* Pricing & Addons */}
          <div>
            <h5 className="font-extrabold text-white uppercase tracking-wider mb-3 text-[11px]">
              Owner Pricing & Badges
            </h5>
            <ul className="space-y-2 text-slate-400">
              <li>Standard Listing: ₹1000/month</li>
              <li>Prime Location Listing: ₹1500/month</li>
              <li className="text-blue-400 font-medium">Blue Verified Tick: ₹500/month</li>
              <li className="text-amber-400 font-medium">⭐ Search Boost Placement: ₹500/month</li>
              <li>Banner Advertisements</li>
            </ul>
          </div>

          {/* Role Navigation */}
          <div>
            <h5 className="font-extrabold text-white uppercase tracking-wider mb-3 text-[11px]">
              Portals & Roles
            </h5>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onRoleChange('customer')}
                  className="hover:text-emerald-400 text-slate-400 transition-colors"
                >
                  Customer Search Portal
                </button>
              </li>
              <li>
                <button
                  onClick={() => onRoleChange('owner')}
                  className="hover:text-emerald-400 text-slate-400 transition-colors"
                >
                  Owner Listing Dashboard
                </button>
              </li>
              {currentUser?.role === 'admin' && (
                <li>
                  <button
                    onClick={() => onRoleChange('admin')}
                    className="hover:text-emerald-400 text-slate-400 transition-colors flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Admin Control Panel</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <p>© {new Date().getFullYear()} THIKANA Marketplace. Built with ❤️ for zero commission travel.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-300 cursor-pointer">Terms of Service</span>
            <span className="hover:text-slate-300 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-slate-300 cursor-pointer">WhatsApp Policy</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
