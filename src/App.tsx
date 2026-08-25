import React, { useState, useEffect } from 'react';
import { UserRole, Property, RoomType } from './types';
import { store } from './services/store';
import { AlertTriangle, Sparkles } from 'lucide-react';

// Components
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { WhatsAppEnquiryModal } from './components/WhatsAppEnquiryModal';
import { PropertyGalleryModal } from './components/PropertyGalleryModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { AuthModal } from './components/AuthModal';

// Views
import { CustomerHomeView } from './views/CustomerHomeView';
import { PropertyDetailView } from './views/PropertyDetailView';
import { OwnerDashboardView } from './views/OwnerDashboardView';
import { AdminDashboardView } from './views/AdminDashboardView';

export function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');
  const [currentView, setCurrentView] = useState<'home' | 'property-detail'>('home');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('All Locations');

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

  const handleOpenAddProperty = () => {
    const user = store.getCurrentUser();
    const isAuthenticHost = Boolean(
      user && 
      user.id !== 'customer_1' && 
      (user.role === 'owner' || user.role === 'admin' || user.googleEmail || user.googleUid)
    );

    if (!isAuthenticHost) {
      setPendingAddProperty(true);
      setIsAuthOpen(true);
    } else {
      setCurrentRole('owner');
      setCurrentView('home');
      setAutoOpenAddProperty(true);
    }
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
        <main className="flex-1">
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

      {/* WhatsApp Booking Enquiry Form Modal */}
      <WhatsAppEnquiryModal
        property={selectedProperty}
        initialRoom={selectedRoomForWhatsApp}
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
      />

      {/* Property Photo & Video Gallery Modal */}
      <PropertyGalleryModal
        property={selectedProperty}
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />

      {/* AI Assistant Modal (THIKANA AI Mitra) */}
      <AIAssistantModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onSelectProperty={handleSelectProperty}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* Authentication & Registration Modal */}
      <AuthModal
        isOpen={isAuthOpen}
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

    </div>
  );
}

export default App;
