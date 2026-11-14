import React, { lazy, Suspense, useState, useEffect } from 'react';
import { UserRole, Property, RoomType } from './types';
import { store } from './services/store';
import { auth } from './lib/firebase';
import { AlertTriangle, Sparkles } from 'lucide-react';

// Components
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
// Load secondary views and dialogs only when a user needs them.
const WhatsAppEnquiryModal = lazy(() => import('./components/WhatsAppEnquiryModal').then((m) => ({ default: m.WhatsAppEnquiryModal })));
const PropertyGalleryModal = lazy(() => import('./components/PropertyGalleryModal').then((m) => ({ default: m.PropertyGalleryModal })));
const AIAssistantModal = lazy(() => import('./components/AIAssistantModal').then((m) => ({ default: m.AIAssistantModal })));
const AuthModal = lazy(() => import('./components/AuthModal').then((m) => ({ default: m.AuthModal })));

// Dashboard and detail views are split into separate network chunks.
const CustomerHomeView = lazy(() => import('./views/CustomerHomeView').then((m) => ({ default: m.CustomerHomeView })));
const PropertyDetailView = lazy(() => import('./views/PropertyDetailView').then((m) => ({ default: m.PropertyDetailView })));
const OwnerDashboardView = lazy(() => import('./views/OwnerDashboardView').then((m) => ({ default: m.OwnerDashboardView })));
const AdminDashboardView = lazy(() => import('./views/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView })));

export function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');
  const [currentView, setCurrentView] = useState<'home' | 'property-detail'>('home');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('All Locations');

  // Resolve direct city URLs (for example /guwahati) into the existing city filter.
  useEffect(() => {
    const slug = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const requestedCity = params.get('city');
    const cityNames = [
      'Guwahati','Dibrugarh','Jorhat','Silchar','Tezpur','Tinsukia','Nagaon','Sivasagar','Dhubri','Diphu','North Lakhimpur','Bongaigaon','Kaziranga','Majuli Island',
      'Itanagar','Naharlagun','Tawang','Ziro Valley','Pasighat','Bomdila','Tezu','Roing','Along (Aalo)','Changlang',
      'Imphal','Thoubal','Bishnupur','Churachandpur','Ukhrul','Senapati',
      'Shillong','Tura','Jowai','Nongpoh','Williamnagar','Baghmara','Cherrapunji (Sohra)','Dawki','Mawlynnong',
      'Aizawl','Lunglei','Champhai','Kolasib','Serchhip','Saiha',
      'Kohima','Dimapur','Mokokchung','Wokha','Tuensang','Mon','Phek','Zunheboto',
      'Gangtok','Namchi','Gyalshing','Mangan','Pakyong','Singtam','Pelling','Ravangla',
      'Agartala','Udaipur','Dharmanagar','Kailashahar','Belonia','Ambassa','Khowai'
    ];
    const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const matchedCity = cityNames.find((city) => normalize(city) === slug);
    const queryCity = cityNames.find((city) => normalize(city) === normalize(requestedCity || ''));
    if (matchedCity) setSelectedCity(matchedCity);
    else if (queryCity) setSelectedCity(queryCity);
  }, []);

  // Keep page metadata and canonical URL aligned with directly opened city routes.
  useEffect(() => {
    const city = selectedCity !== 'All Locations' ? selectedCity : '';
    const title = city
      ? `${city} Hotels, Homestays & Rooms | YourThikana`
      : 'YourThikana | Find Hotels, Homestays, Hostels & Rooms';
    const pageDescription = city
      ? `Explore hotels, homestays, hostels, cottages and monthly rooms in ${city}. Contact local hosts directly on WhatsApp with YourThikana.`
      : 'Discover hotels, homestays, hostels, cottages and monthly rooms. Contact local hosts directly on WhatsApp with YourThikana.';

    document.title = title;

    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
      let element = document.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    setMeta('meta[name="description"]', 'name', 'description', pageDescription);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', pageDescription);

    // City landing routes must not advertise the homepage as their canonical URL.
    const path = window.location.pathname.replace(/\\/+$/, '') || '/';
    const canonicalUrl = `${window.location.origin}${path}`;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  }, [selectedCity]);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState<boolean>(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState<boolean>(false);
  const [selectedRoomForWhatsApp, setSelectedRoomForWhatsApp] = useState<RoomType | undefined>(undefined);

  // App Frame Toggle
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(store.getMobileFrame());
  const [isDark, setIsDark] = useState<boolean>(store.getTheme());
  const [isNoticeDismissed, setIsNoticeDismissed] = useState<boolean>(false);

  useEffect(() => {
    return store.subscribe(() => {
      setIsMobileFrame(store.getMobileFrame());
      setIsDark(store.getTheme());
    });
  }, []);

  const hasTrackedVisitRef = React.useRef<boolean>(false);

  // Handle QR scan / referral link parameters on URL load
  useEffect(() => {
    const handleUrlTracking = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const propertyId = params.get('p') || params.get('propertyId') || params.get('property');
        const refId = params.get('ref') || params.get('refId');

        if (propertyId) {
          const found = store.getPropertyById(propertyId);
          if (found) {
            setSelectedProperty(found);
            setCurrentView('property-detail');
          }

          if (refId) {
            sessionStorage.setItem('thikana_current_refId', refId);

            if (!hasTrackedVisitRef.current) {
              hasTrackedVisitRef.current = true;
              store.trackVisit(propertyId, refId, 'qr_referral');
            }
          }
        }
      } catch (e) {
        console.warn('URL search parse error:', e);
      }
    };

    handleUrlTracking();

    // Subscribe to store updates in case properties are loaded asynchronously from Firestore
    const unsubscribe = store.subscribe(() => {
      handleUrlTracking();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Update HTML class for dark theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const [autoOpenAddProperty, setAutoOpenAddProperty] = useState<boolean>(false);
  const [pendingAddProperty, setPendingAddProperty] = useState<boolean>(false);

  const handleOpenAddProperty = async () => {
    const firebaseUser = auth?.currentUser;
    let user = store.getCurrentUser();

    // Restore the Firestore profile for an existing Firebase session instead of
    // showing a second login prompt while the auth listener is still catching up.
    if (firebaseUser && (!user || user.id !== firebaseUser.uid)) {
      try {
        user = await store.loadFirebaseUserProfile(firebaseUser.uid);
      } catch (error: any) {
        store.firestoreError = error?.message || 'Could not load your account profile.';
      }
    }

    if (!firebaseUser) {
      setPendingAddProperty(true);
      setIsAuthOpen(true);
      return;
    }

    if (!user) {
      store.firestoreError = 'You are signed in, but your YourThikana profile could not be loaded. Please refresh once or contact support; do not create another account.';
      return;
    }

    if (user.role !== 'owner' && user.role !== 'admin') {
      store.firestoreError = 'This account is not registered as a host account. Please contact support.';
      return;
    }

    setCurrentRole('owner');
    setCurrentView('home');
    setAutoOpenAddProperty(true);
  };

  const handleSelectProperty = (prop: Property) => {
    setSelectedProperty(prop);
    setCurrentView('property-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenWhatsApp = (prop: Property, room?: RoomType) => {
    setSelectedProperty(prop);
    setSelectedRoomForWhatsApp(room);
    setIsWhatsAppOpen(true);
  };

  const handleOpenGallery = (prop: Property) => {
    setSelectedProperty(prop);
    setIsGalleryOpen(true);
  };

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors ${
      isMobileFrame ? 'p-0 sm:p-6 bg-slate-950' : ''
    }`}>
      
      {/* Mobile Frame Container Wrapper (if Mobile Frame toggled) */}
      <div className={isMobileFrame ? 'max-w-[430px] mx-auto min-h-[880px] bg-white dark:bg-slate-900 rounded-[48px] overflow-hidden shadow-2xl border-[12px] border-slate-800 relative flex flex-col my-4' : 'flex flex-col min-h-screen'}>
        
        {/* Navigation Bar */}
        <Navbar
          currentRole={currentRole}
          onRoleChange={(role) => {
            setCurrentRole(role);
            setCurrentView('home');
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAI={() => setIsAIOpen(true)}
          onOpenAddProperty={handleOpenAddProperty}
          onSelectCity={setSelectedCity}
          selectedCity={selectedCity}
        />

        {/* Firestore Configuration Error Banner (Dismissable) */}
        {!isNoticeDismissed && store.firestoreError && (
          <div className="bg-amber-50 dark:bg-amber-950/80 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>System Notice:</strong> {store.firestoreError}
              </span>
            </div>
            <button
              onClick={() => {
                setIsNoticeDismissed(true);
                store.firestoreError = null;
              }}
              className="text-xs underline text-amber-700 dark:text-amber-300 hover:text-amber-900 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main id="stays" className="flex-1">
          <Suspense fallback={<div className="min-h-40 flex items-center justify-center text-sm text-slate-600 dark:text-slate-300" role="status">Loading YourThikana…</div>}>
          {currentRole === 'customer' && (
            currentView === 'home' || !selectedProperty ? (
              <CustomerHomeView
                onSelectProperty={handleSelectProperty}
                onOpenWhatsApp={handleOpenWhatsApp}
                onSelectCity={setSelectedCity}
                selectedCity={selectedCity}
              />
            ) : (
              <PropertyDetailView
                property={selectedProperty}
                onBack={() => setCurrentView('home')}
                onOpenWhatsApp={handleOpenWhatsApp}
                onOpenGallery={handleOpenGallery}
              />
            )
          )}

          {currentRole === 'owner' && (
            <OwnerDashboardView
              onSelectProperty={handleSelectProperty}
              autoOpenAddProperty={autoOpenAddProperty}
              onAddPropertyHandled={() => setAutoOpenAddProperty(false)}
            />
          )}

          {currentRole === 'admin' && (
            <AdminDashboardView />
          )}
          </Suspense>
        </main>

        {/* Footer */}
        <Footer
          onRoleChange={(role) => {
            setCurrentRole(role);
            setCurrentView('home');
          }}
          onOpenAddProperty={handleOpenAddProperty}
        />

      </div>

      {/* Floating AI Mitra Trigger Button (Mobile-First Accessible) */}
      <button
        onClick={() => setIsAIOpen(true)}
        className="fixed bottom-5 right-5 z-40 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-xs sm:text-sm py-2.5 px-4 rounded-full shadow-xl shadow-emerald-600/30 flex items-center gap-2 border border-emerald-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
        title="Ask THIKANA AI Mitra"
      >
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span>AI Mitra</span>
        <span className="hidden sm:inline bg-emerald-700/60 text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
          0% fee
        </span>
      </button>

      {/* Dialog chunks are downloaded only after the corresponding action. */}
      <Suspense fallback={null}>
        {isWhatsAppOpen && (
          <WhatsAppEnquiryModal
            property={selectedProperty}
            initialRoom={selectedRoomForWhatsApp}
            isOpen={true}
            onClose={() => setIsWhatsAppOpen(false)}
          />
        )}
        {isGalleryOpen && (
          <PropertyGalleryModal
            property={selectedProperty}
            isOpen={true}
            onClose={() => setIsGalleryOpen(false)}
          />
        )}
        {isAIOpen && (
          <AIAssistantModal
            isOpen={true}
            onClose={() => setIsAIOpen(false)}
            onSelectProperty={handleSelectProperty}
            onOpenWhatsApp={handleOpenWhatsApp}
          />
        )}
        {isAuthOpen && (
          <AuthModal
            isOpen={true}
            onClose={() => {
              setIsAuthOpen(false);
              setPendingAddProperty(false);
            }}
            onSuccessRole={(role) => {
              setIsAuthOpen(false);
              setCurrentRole('owner');
              setCurrentView('home');
              if (pendingAddProperty) {
                setPendingAddProperty(false);
                setAutoOpenAddProperty(true);
              }
            }}
          />
        )}
      </Suspense>

    </div>
  );
}

export default App;
