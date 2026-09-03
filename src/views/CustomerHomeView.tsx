import React, { useState, useMemo } from 'react';
import { Property, RoomType } from '../types';
import { store } from '../services/store';
import { PropertyCard } from '../components/PropertyCard';
import { BannerSlider } from '../components/BannerSlider';
import { 
  Search, 
  MapPin, 
  Filter, 
  Sparkles, 
  BadgeCheck, 
  SlidersHorizontal, 
  Building2, 
  Star, 
  X,
  Compass,
  Zap,
  IndianRupee,
  Tag,
  RotateCcw
} from 'lucide-react';

interface CustomerHomeViewProps {
  onSelectProperty: (property: Property) => void;
  onOpenWhatsApp: (property: Property, room?: RoomType) => void;
  onSelectCity: (city: string) => void;
  selectedCity: string;
}

export const CustomerHomeView: React.FC<CustomerHomeViewProps> = ({
  onSelectProperty,
  onOpenWhatsApp,
  onSelectCity,
  selectedCity,
}) => {
  const [properties, setProperties] = useState<Property[]>(store.getProperties());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [minRating, setMinRating] = useState<number>(0);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);
  const [onlyFeatured, setOnlyFeatured] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [selectedState, setSelectedState] = useState<string>('All States');

  React.useEffect(() => {
    return store.subscribe(() => {
      setProperties(store.getProperties());
    });
  }, []);

  const CITIES = [
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

  const NORTHEAST_STATES = [
    'All States',
    'Assam',
    'Meghalaya',
    'Sikkim',
    'Arunachal Pradesh',
    'Nagaland',
    'Mizoram',
    'Manipur',
    'Tripura'
  ];

  const PRICE_RANGES = [
    { id: 'all', label: 'All Prices' },
    { id: 'under-1500', label: 'Under ₹1,500' },
    { id: '1500-3000', label: '₹1,500 - ₹3,000' },
    { id: '3000-5000', label: '₹3,000 - ₹5,000' },
    { id: 'above-5000', label: '₹5,000+' },
  ];

  const PROPERTY_TYPES: string[] = [
    'All',
    'Homestay',
    'Hotel',
    'Monthly Room',
    'PG / Hostel',
    'Resort',
    'Villa',
    'Cottage'
  ];

  // Cache minimum prices for properties
  const propertyPrices = useMemo(() => {
    const priceMap: Record<string, number> = {};
    (properties || []).forEach((p) => {
      if (!p || !p.id) return;
      const rooms = store.getRoomsByProperty(p.id) || [];
      if (rooms.length > 0) {
        const validPrices = rooms
          .map((r) => r.discountPrice || r.pricePerNight)
          .filter((price): price is number => typeof price === 'number' && !isNaN(price) && price > 0);
        priceMap[p.id] = validPrices.length > 0 ? Math.min(...validPrices) : 1500;
      } else {
        priceMap[p.id] = 1500;
      }
    });
    return priceMap;
  }, [properties]);

  // Filter properties logic safely
  const filteredProperties = useMemo(() => {
    try {
      return (properties || []).filter((p) => {
        if (!p || typeof p !== 'object') return false;
        // Must be active
        if (p.status !== 'active') return false;

        const pState = String(p.state || '').toLowerCase();
        const pCity = String(p.city || '').toLowerCase();
        const pTitle = String(p.title || '').toLowerCase();
        const pAddress = String(p.address || '').toLowerCase();
        const pType = String(p.propertyType || '').toLowerCase();
        const pDesc = String(p.description || '').toLowerCase();

        // State filter
        if (selectedState && selectedState !== 'All States' && pState !== selectedState.toLowerCase()) {
          return false;
        }

        // City filter
        if (selectedCity && selectedCity !== 'All Locations' && pCity !== selectedCity.toLowerCase()) {
          return false;
        }

        // Search Query (City, Title, Address, State, Type, Description)
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = pTitle.includes(q);
          const matchCity = pCity.includes(q);
          const matchAddress = pAddress.includes(q);
          const matchState = pState.includes(q);
          const matchType = pType.includes(q);
          const matchDesc = pDesc.includes(q);
          if (!matchTitle && !matchCity && !matchAddress && !matchState && !matchType && !matchDesc) {
            return false;
          }
        }

        // Price Range Filter Chip
        const price = (propertyPrices && p.id && typeof propertyPrices[p.id] === 'number') ? propertyPrices[p.id] : 1500;
        if (selectedPriceRange === 'under-1500' && price > 1500) return false;
        if (selectedPriceRange === '1500-3000' && (price < 1500 || price > 3000)) return false;
        if (selectedPriceRange === '3000-5000' && (price < 3000 || price > 5000)) return false;
        if (selectedPriceRange === 'above-5000' && price < 5000) return false;

        // Custom Slider Max Price Filter
        if (price > maxPrice) return false;

        // Property Type Filter
        if (selectedType && selectedType !== 'All') {
          const sel = selectedType.toLowerCase();
          if (sel === 'pg / hostel') {
            if (!pType.includes('pg') && !pType.includes('hostel')) return false;
          } else if (sel === 'monthly room') {
            if (!pType.includes('monthly')) return false;
          } else if (pType !== sel) {
            return false;
          }
        }

        // Rating Filter
        const rating = typeof p.rating === 'number' && !isNaN(p.rating) ? p.rating : 5.0;
        if (rating < minRating) return false;

        // Verified Filter
        if (onlyVerified && !p.isVerified) return false;

        // Featured Filter
        if (onlyFeatured && !p.isFeatured) return false;

        return true;
      }).sort((a, b) => {
        if (a?.isFeatured && !b?.isFeatured) return -1;
        if (!a?.isFeatured && b?.isFeatured) return 1;
        const rA = typeof a?.rating === 'number' ? a.rating : 5.0;
        const rB = typeof b?.rating === 'number' ? b.rating : 5.0;
        return rB - rA;
      });
    } catch (err) {
      console.error('Error during search filtering:', err);
      return properties || [];
    }
  }, [properties, selectedState, selectedCity, searchQuery, selectedPriceRange, maxPrice, selectedType, minRating, onlyVerified, onlyFeatured, propertyPrices]);

  const activeFiltersCount = (searchQuery ? 1 : 0) + 
    (selectedCity !== 'All Locations' ? 1 : 0) + 
    (selectedState !== 'All States' ? 1 : 0) + 
    (selectedPriceRange !== 'all' ? 1 : 0) + 
    (selectedType !== 'All' ? 1 : 0) + 
    (onlyVerified ? 1 : 0) + 
    (onlyFeatured ? 1 : 0) + 
    (minRating > 0 ? 1 : 0);

  const resetAllFilters = () => {
    setSearchQuery('');
    onSelectCity('All Locations');
    setSelectedState('All States');
    setSelectedPriceRange('all');
    setSelectedType('All');
    setMaxPrice(10000);
    setMinRating(0);
    setOnlyVerified(false);
    setOnlyFeatured(false);
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Hero Search Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-slate-700/60">
        
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full">
            <Zap className="w-3.5 h-3.5 fill-emerald-400" />
            Northeast India's Direct Homestay & Eco Stay Portal
          </span>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
            Find Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">Northeast THIKANA</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Book directly on WhatsApp with local hosts across Assam, Meghalaya, Sikkim, Nagaland, Arunachal, Mizoram, Manipur & Tripura. Zero middleman fees!
          </p>

          {/* Search Box Input Bar */}
          <div className="pt-2">
            <form onSubmit={(e) => e.preventDefault()} className="bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-2">
              <div className="flex-1 flex items-center gap-2.5 px-3 py-2 w-full">
                <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by city (e.g. Kaziranga, Shillong, Tawang), stay name, or state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm font-medium bg-transparent outline-none"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="p-1 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter Button Toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center cursor-pointer shrink-0 ${
                  showFilters || activeFiltersCount > 0
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-amber-400 text-slate-950 rounded-full w-5 h-5 text-[10px] font-black flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* City Filter Chips */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Select City / Location:
              </span>
              {selectedCity !== 'All Locations' && (
                <button
                  onClick={() => onSelectCity('All Locations')}
                  className="text-[11px] text-emerald-300 hover:underline font-bold"
                >
                  Clear City
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {CITIES.map((city) => (
                <button
                  key={city}
                  onClick={() => onSelectCity(city)}
                  className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                    selectedCity === city
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-lg scale-105'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700/80'
                  }`}
                >
                  {city !== 'All Locations' && <MapPin className="w-3 h-3 text-emerald-400 group-hover:text-white" />}
                  <span>{city}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Price Range Filter Chips */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                Filter By Nightly Price Range:
              </span>
              {selectedPriceRange !== 'all' && (
                <button
                  onClick={() => setSelectedPriceRange('all')}
                  className="text-[11px] text-amber-300 hover:underline font-bold"
                >
                  Clear Price Filter
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PRICE_RANGES.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => setSelectedPriceRange(pr.id)}
                  className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                    selectedPriceRange === pr.id
                      ? 'bg-amber-400 text-slate-950 font-black shadow-lg scale-105'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700/80'
                  }`}
                >
                  <Tag className="w-3 h-3 text-amber-400" />
                  <span>{pr.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* State Filter Pills Bar */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">State:</span>
            {NORTHEAST_STATES.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedState(st)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-bold transition-all cursor-pointer ${
                  selectedState === st
                    ? 'bg-teal-400 text-slate-950 font-extrabold shadow-md scale-105'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 border border-slate-700/50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Expanded Filter Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl space-y-4 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Advanced Search & Custom Filters</span>
            </h4>

            <button
              onClick={resetAllFilters}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            
            {/* Property Type Filter */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Property Category
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Price Range Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Max Price / Night
                </label>
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  ₹{maxPrice}
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="15000"
                step="500"
                value={maxPrice}
                onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Minimum Rating */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Minimum Guest Rating
              </label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value={0}>Any Rating</option>
                <option value={4.0}>4.0+ ⭐</option>
                <option value={4.5}>4.5+ ⭐ (Highly Rated)</option>
                <option value={4.8}>4.8+ ⭐ (Top Rated)</option>
              </select>
            </div>

            {/* Verified & Featured Badges */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyVerified}
                  onChange={(e) => setOnlyVerified(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span className="flex items-center gap-1">
                  <BadgeCheck className="w-4 h-4 text-blue-600 fill-white" />
                  Blue Verified Only
                </span>
              </label>

              <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyFeatured}
                  onChange={(e) => setOnlyFeatured(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span className="flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  ⭐ Featured Boost Only
                </span>
              </label>
            </div>

          </div>
        </div>
      )}

      {/* Property Type Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PROPERTY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
              selectedType === type
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {type === 'All'
              ? '🏡 All Stays'
              : type === 'Monthly Room'
              ? '📅 Monthly Rooms'
              : type === 'PG / Hostel'
              ? '🏢 PG / Hostel'
              : type}
          </button>
        ))}
      </div>

      {/* Top Banner Advertisement */}
      <BannerSlider position="home" />

      {/* Active Filters Bar / Results Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>Available Homestays & Hotels</span>
            {selectedCity !== 'All Locations' && (
              <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-800 font-bold">
                {selectedCity}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filteredProperties.length} properties {selectedCity !== 'All Locations' ? `in ${selectedCity}` : 'across Northeast India'}
          </p>
        </div>

        {/* Clear Filters Quick Action if any filters active */}
        {activeFiltersCount > 0 && (
          <button
            onClick={resetAllFilters}
            className="text-xs text-rose-600 dark:text-rose-400 font-extrabold hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear Active Filters ({activeFiltersCount})</span>
          </button>
        )}
      </div>

      {/* Properties Grid */}
      {filteredProperties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onSelect={onSelectProperty}
              onOpenWhatsApp={onOpenWhatsApp}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-700 space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto font-black text-2xl">
            THIKANA
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            No Properties Found Matching Your Criteria
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            No homestays match the selected city, search keyword, or price range. Try clearing your filters to explore all listings across Northeast India.
          </p>
          <button
            onClick={resetAllFilters}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Search Page Bottom Banner */}
      <BannerSlider position="search" />

    </div>
  );
};
