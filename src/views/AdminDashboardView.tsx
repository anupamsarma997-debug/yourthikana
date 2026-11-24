import React, { useState, useEffect } from 'react';
import { store } from '../services/store';
import { Property, User, BannerAd } from '../types';
import { auth } from '../lib/firebase';
import { BlueTickAdminPanel } from '../components/BlueTickAdminPanel';
import { SearchBoostAdminPanel } from '../components/SearchBoostAdminPanel';
import { MonthlySubscriptionAdminPanel } from '../components/MonthlySubscriptionAdminPanel';
import { isBlueTickActive, isSearchBoostActive } from '../utils/propertyBadges';
import { 
  ShieldCheck, 
  ShieldAlert,
  RefreshCw,
  TrendingUp, 
  Building2, 
  Users, 
  Megaphone, 
  CheckCircle2, 
  XCircle, 
  BadgeCheck, 
  Sparkles, 
  PlusCircle, 
  Trash2, 
  Lock, 
  Unlock,
  DollarSign,
  Clock,
  Layers,
  Check
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>(store.getProperties());
  const [users, setUsers] = useState<User[]>(store.getUsers());
  const [banners, setBanners] = useState<BannerAd[]>(store.getAllBanners());
  const [transactions, setTransactions] = useState(store.getTransactions());
  const [activeTab, setActiveTab] = useState<'properties' | 'users' | 'banners' | 'revenue' | 'verifications' | 'searchBoosts' | 'subscriptionApps'>('properties');

  // Only the founder's verified Firebase account may enter the admin dashboard.
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [claimDetails, setClaimDetails] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function verifyPlatformOwner() {
      setIsVerifying(true);
      setIsAuthorized(false);
      const fbUser = auth?.currentUser;

      if (!fbUser || fbUser.email !== 'anupamsarma997@gmail.com' || !fbUser.emailVerified) {
        if (isMounted) {
          setClaimDetails('Only the verified platform-owner Google account is allowed.');
          setIsVerifying(false);
        }
        return;
      }

      try {
        const tokenResult = await fbUser.getIdTokenResult(true);
        const isOwnerToken =
          tokenResult.claims.email === 'anupamsarma997@gmail.com' &&
          tokenResult.claims.email_verified === true &&
          tokenResult.signInProvider === 'google.com';

        if (isMounted) {
          setIsAuthorized(isOwnerToken);
          setClaimDetails(isOwnerToken ? 'Verified platform owner account' : 'Owner email verification missing from Firebase token');
          setIsVerifying(false);
        }
      } catch (error) {
        console.warn('Platform owner verification failed:', error);
        if (isMounted) {
          setClaimDetails('Could not verify the platform-owner Firebase token.');
          setIsVerifying(false);
        }
      }
    }

    verifyPlatformOwner();
    return () => {
      isMounted = false;
    };
  }, []);

  // Banner Form State
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('Promote Your Homestay with THIKANA Ads');
  const [bannerSubtitle, setBannerSubtitle] = useState('Promote your travel-related business to people exploring stays on YourThikana.');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [bannerTargetUrl, setBannerTargetUrl] = useState('https://mythikana.vercel.app/');
  const [bannerCtaText, setBannerCtaText] = useState('Advertise Now');
  const [bannerPosition, setBannerPosition] = useState<'home' | 'search' | 'property'>('home');

  React.useEffect(() => {
    return store.subscribe(() => {
      setProperties(store.getProperties());
      setUsers(store.getUsers());
      setBanners(store.getAllBanners());
      setTransactions(store.getTransactions());
    });
  }, []);

  // Compute Revenue Stats
  const totalRevenue = transactions.reduce((acc, t) => acc + t.amount, 0);
  const totalVerifiedCount = properties.filter((p) => p.isVerified).length;
  const totalFeaturedCount = properties.filter((p) => p.isFeatured).length;

  const handlePropertyStatus = async (propertyId: string, status: Property['status']) => {
    const result = await store.setPropertyStatus(propertyId, status);
    alert(result.message || (result.success ? 'Listing updated.' : 'Could not update listing.'));
  };

  const handleDeleteProperty = async (property: Property) => {
    if (!confirm(`Permanently delete "${property.title}"? Its listing, rooms and duplicate-listing lock will be removed. This cannot be undone.`)) return;
    const result = await store.deleteProperty(property.id);
    alert(result.message || (result.success ? 'Listing deleted.' : 'Could not delete listing.'));
  };

  const handleAddBanner = (e: React.FormEvent) => {
    e.preventDefault();
    store.addBanner({
      title: bannerTitle,
      subtitle: bannerSubtitle,
      imageUrl: bannerImageUrl,
      targetUrl: bannerTargetUrl,
      ctaText: bannerCtaText,
      position: bannerPosition,
      isActive: true,
    });
    alert('New banner advertisement added successfully!');
    setIsBannerModalOpen(false);
  };

  if (isVerifying) {
    return (
      <div className="max-w-2xl mx-auto my-20 p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Verifying Admin Credentials</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Performing strict server-side verification of Firebase Auth Custom Claims & ID Token...
        </p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 bg-red-50 dark:bg-red-950/40 rounded-3xl border border-red-200 dark:border-red-900 text-center space-y-4 shadow-2xl">
        <ShieldAlert className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto" />
        <h2 className="text-2xl font-black text-red-900 dark:text-red-200">Access Denied</h2>
        <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
          Strict Server-Side Validation Failed. Your account lacks required Firebase Auth Custom Claims (<code className="font-mono font-bold">admin: true</code>) or master admin privileges.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Admin Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-500 text-slate-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              THIKANA Master Admin
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <BadgeCheck className="w-3.5 h-3.5" /> Verified Platform Owner
            </span>
            {claimDetails && (
              <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-full">
                {claimDetails}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">
            Platform Management & Analytics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Approve hotel & homestay listings, manage subscription revenue, verify property badges, and configure advertisement banners.
          </p>
        </div>
      </div>

      {/* Analytics Counter Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Total Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            ₹{totalRevenue}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            Subscriptions & Badges
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Properties</span>
            <Building2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {properties.length}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {properties.filter((p) => p.status === 'active').length} Active Listings
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Verified Badges</span>
            <BadgeCheck className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {totalVerifiedCount}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
            ₹500 one-time verification fee
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Search Boosts</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {totalFeaturedCount}
          </p>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
            ⭐ ₹500/mo Top Placements
          </p>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${
            activeTab === 'properties' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Property Management ({properties.length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${
            activeTab === 'users' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          User Accounts ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('banners')}
          className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${
            activeTab === 'banners' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Banner Ads ({banners.length})
        </button>

        <button
          onClick={() => setActiveTab('revenue')}
          className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${
            activeTab === 'revenue' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Revenue Log ({transactions.length})
        </button>
        <button onClick={() => setActiveTab('subscriptionApps')} className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'subscriptionApps' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>Monthly Subscriptions</button>
        <button onClick={() => setActiveTab('verifications')} className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'verifications' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>Blue Tick Verification</button>
        <button onClick={() => setActiveTab('searchBoosts')} className={`flex-1 py-3 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'searchBoosts' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>Search Boost Review</button>
      </div>

      {activeTab === 'subscriptionApps' && <MonthlySubscriptionAdminPanel />}
      {activeTab === 'verifications' && <BlueTickAdminPanel />}
      {activeTab === 'searchBoosts' && <SearchBoostAdminPanel />}

      {/* Tab 1: Properties Table */}
      {activeTab === 'properties' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              All Property Listings
            </h3>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">
              {properties.filter((p) => p.status === 'pending').length} awaiting review
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Property</th>
                  <th className="p-3">Owner Info</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Badges</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {properties.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      <p>{p.title}</p>
                      <span className="text-[10px] text-slate-400 font-normal">{p.propertyType}</span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{p.ownerName}</p>
                      <p className="text-[10px] text-slate-400">{p.ownerPhone}</p>
                    </td>
                    <td className="p-3 font-medium">
                      {p.city}, {p.state}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 space-x-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${isBlueTickActive(p) ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        {isBlueTickActive(p) ? 'Verified ✓' : 'Not verified'}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${isSearchBoostActive(p) ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        {isSearchBoostActive(p) ? '⭐ Boosted' : 'Not boosted'}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {p.status === 'pending' && (
                        <button
                          onClick={() => handlePropertyStatus(p.id, 'active')}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                        >
                          Approve
                        </button>
                      )}
                      {p.status !== 'rejected' && (
                        <button
                          onClick={() => handlePropertyStatus(p.id, 'rejected')}
                          className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] font-bold text-amber-800"
                        >
                          Reject
                        </button>
                      )}
                      {p.status === 'active' ? (
                        <button
                          onClick={() => handlePropertyStatus(p.id, 'blocked')}
                          className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          Hide
                        </button>
                      ) : (p.status === 'blocked' || p.status === 'rejected') ? (
                        <button
                          onClick={() => handlePropertyStatus(p.id, 'pending')}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Reopen
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleDeleteProperty(p)}
                        className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Users */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            User Accounts
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">User Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{u.name}</td>
                    <td className="p-3 font-semibold uppercase text-[10px] text-emerald-600">{u.role}</td>
                    <td className="p-3">{u.email} • {u.phone}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => store.toggleUserStatus(u.id)}
                        className="text-[11px] font-bold text-emerald-600 hover:underline"
                      >
                        Toggle Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Banners */}
      {activeTab === 'banners' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Advertisement Banners
            </h3>

            <button
              onClick={() => setIsBannerModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Banner Ad</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {banners.map((b) => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                      Position: {b.position}
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                      {b.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{b.subtitle}</p>
                  </div>

                  <button
                    onClick={() => store.toggleBannerStatus(b.id)}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${
                      b.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {b.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>

                <img src={b.imageUrl} alt="" className="w-full h-28 object-cover rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Revenue Log */}
      {activeTab === 'revenue' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            Subscription & Badge Transactions
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Property</th>
                  <th className="p-3">Plan / Addon</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{t.propertyName}</td>
                    <td className="p-3 font-semibold text-emerald-600">{t.planName}</td>
                    <td className="p-3 font-extrabold text-slate-900 dark:text-white">₹{t.amount}</td>
                    <td className="p-3 text-slate-400">{t.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Banner */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
              Add Advertisement Banner
            </h3>

            <form onSubmit={handleAddBanner} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Banner Title</label>
                <input
                  type="text"
                  required
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Subtitle</label>
                <input
                  type="text"
                  required
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Image URL</label>
                <input
                  type="url"
                  required
                  value={bannerImageUrl}
                  onChange={(e) => setBannerImageUrl(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Position</label>
                <select
                  value={bannerPosition}
                  onChange={(e: any) => setBannerPosition(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2 rounded-xl"
                >
                  <option value="home">Home Page</option>
                  <option value="search">Search Results Page</option>
                  <option value="property">Property Detail Page</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 text-white font-bold px-5 py-2 rounded-xl"
                >
                  Save Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
