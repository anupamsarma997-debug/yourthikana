import React, { useState, useEffect, useRef } from 'react';
import { Property, RoomType } from '../types';
import { store } from '../services/store';
import { 
  extractCriteriaFromText, 
  searchAndRankProperties, 
  MitraSearchCriteria, 
  MitraPropertyMatch, 
  createWhatsAppBookingMessage 
} from '../services/aiMitraEngine';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  User as UserIcon, 
  Loader2, 
  MessageCircle, 
  MapPin, 
  ShieldCheck, 
  Star, 
  Users, 
  IndianRupee, 
  ChevronRight, 
  Filter, 
  RotateCcw, 
  BedDouble, 
  Compass, 
  Eye, 
  Check, 
  SlidersHorizontal,
  Mic,
  MicOff
} from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProperty?: (property: Property) => void;
  onOpenWhatsApp?: (property: Property, room?: RoomType) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  properties?: MitraPropertyMatch[];
  criteria?: MitraSearchCriteria;
  isFallback?: boolean;
  timestamp: Date;
}

const POPULAR_DESTINATIONS = [
  'All Northeast',
  'Kaziranga',
  'Cherrapunji',
  'Tawang',
  'Majuli Island',
  'Kohima',
  'Gangtok',
  'Shillong',
  'Guwahati'
];

const SUGGESTED_QUICK_ACTIONS = [
  { label: 'Kaziranga stays', query: 'Find homestays in Kaziranga near safari gate' },
  { label: 'Sohra homestays', query: 'Find peaceful homestay near Sohra Cherrapunji with mountain views' },
  { label: 'Under ₹1500', query: 'Show me verified stays under ₹1500 per night' },
  { label: 'Family stays', query: 'Find family eco stays for 4 people' },
  { label: 'Near safari', query: 'Homestay closest to Kaziranga Safari Gate' },
  { label: 'Mountain view', query: 'Stays with mountain views in Tawang or Gangtok' }
];

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ 
  isOpen, 
  onClose,
  onSelectProperty,
  onOpenWhatsApp
}) => {
  if (!isOpen) return null;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentCriteria, setCurrentCriteria] = useState<MitraSearchCriteria>({});
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_msg',
      sender: 'ai',
      text: `Khulumkha! Namaskar! 🙏 I am **THIKANA AI Mitra**, your Northeast Stay Discovery Assistant.

I search authentic, verified homestays, Chang Ghar bamboo stays, and eco cottages across **Assam, Meghalaya, Arunachal Pradesh, Sikkim, Nagaland, Mizoram, Manipur & Tripura** — connecting you directly with local hosts on WhatsApp with **zero middleman commission**.

Tell me where you want to travel, your budget, or who is travelling with you! *(English, हिंदी, or Hinglish)*`,
      timestamp: new Date()
    }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle Speech Recognition if supported
  const handleToggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please type your message.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Voice input error:', err);
      setIsListening(false);
    }
  };

  // Perform grounded search & conversational AI response
  const processQuery = async (userText: string, manualCriteriaOverrides?: Partial<MitraSearchCriteria>) => {
    if (!userText.trim() && !manualCriteriaOverrides) return;

    const userMessageText = userText.trim() || 'Updated search preferences';
    const updatedCriteria = extractCriteriaFromText(userMessageText, {
      ...currentCriteria,
      ...(manualCriteriaOverrides || {})
    });
    
    setCurrentCriteria(updatedCriteria);

    // Add User message
    const userMsgId = 'user_' + Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: userMessageText,
        criteria: updatedCriteria,
        timestamp: new Date()
      }
    ]);

    setLoading(true);

    try {
      // 1. Search and Rank real THIKANA listings grounded in Store
      const allActiveProperties = store.getProperties().filter((p) => p.status === 'active');
      const searchResult = searchAndRankProperties(allActiveProperties, updatedCriteria, userMessageText);

      // Prepare payload for Gemini AI explanation
      const candidateSummary = searchResult.matches.map((m) => ({
        id: m.property.id,
        title: m.property.title,
        propertyType: m.property.propertyType,
        city: m.property.city,
        state: m.property.state,
        startingPrice: m.startingPrice,
        maxGuests: m.maxCapacity,
        amenities: m.amenities,
        distanceNote: m.distanceNote,
        matchReason: m.matchReason,
        isVerified: m.property.isVerified,
        ownerName: m.property.ownerName,
        ownerWhatsApp: m.property.ownerWhatsApp || m.property.ownerPhone
      }));

      const conversationHistory = messages.slice(-5).map((m) => ({
        sender: m.sender,
        text: m.text
      }));

      // Call server-side AI Travel Assistant
      let aiExplanation = searchResult.explanation;
      try {
        const res = await fetch('/api/ai/travel-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: userMessageText,
            criteria: updatedCriteria,
            availableProperties: candidateSummary,
            conversationHistory
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.reply) {
            aiExplanation = data.reply;
          }
        }
      } catch (apiErr) {
        console.warn('Fallback to built-in explanation engine:', apiErr);
      }

      // Add AI Response with structured property cards
      setMessages((prev) => [
        ...prev,
        {
          id: 'ai_' + Date.now(),
          sender: 'ai',
          text: aiExplanation,
          properties: searchResult.matches,
          criteria: updatedCriteria,
          isFallback: !searchResult.isExactMatch,
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error('Error in AI Mitra:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'ai_err_' + Date.now(),
          sender: 'ai',
          text: 'I ran into an issue connecting with the discovery service, but here are our top verified Northeast homestays on THIKANA for direct WhatsApp booking:',
          properties: searchAndRankProperties(store.getProperties(), {}).matches,
          timestamp: new Date()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    const text = query;
    setQuery('');
    processQuery(text);
  };

  const handleQuickAction = (actionQuery: string) => {
    setQuery('');
    processQuery(actionQuery);
  };

  const handleResetSearch = () => {
    setCurrentCriteria({});
    setMessages((prev) => [
      ...prev,
      {
        id: 'reset_' + Date.now(),
        sender: 'ai',
        text: 'Search criteria reset. Tell me what kind of Northeast stay you are looking for!',
        timestamp: new Date()
      }
    ]);
  };

  // Direct WhatsApp Trigger from recommendation card
  const handleDirectWhatsApp = (match: MitraPropertyMatch) => {
    const prop = match.property;
    const room = match.matchingRooms[0];
    const message = createWhatsAppBookingMessage(prop, currentCriteria, room);

    // Track lead in store
    store.trackLead(prop.id, 'ai_mitra', 'AI Mitra Traveler', 'whatsapp');

    // Clean phone number
    let cleanPhone = prop.ownerWhatsApp || prop.ownerPhone || '919435012345';
    cleanPhone = cleanPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const handleOpenDetailedEnquiry = (match: MitraPropertyMatch) => {
    if (onOpenWhatsApp) {
      onOpenWhatsApp(match.property, match.matchingRooms[0]);
    } else {
      handleDirectWhatsApp(match);
    }
  };

  const handleViewPropertyDetails = (match: MitraPropertyMatch) => {
    if (onSelectProperty) {
      onSelectProperty(match.property);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-slate-800 relative flex flex-col h-[92vh] sm:h-[680px] max-h-[900px] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                  THIKANA AI Mitra
                </h3>
                <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700/60">
                  0% Commission
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Your Northeast Stay Discovery Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Filter Toggle Button */}
            <button
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors ${
                showFilterBar || Object.keys(currentCriteria).length > 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Toggle Search Filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {Object.keys(currentCriteria).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Filter Bar (Collapsible / Active State) */}
        {showFilterBar && (
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 mt-2 space-y-2.5 text-xs animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-600" />
                <span>Active Search Filters:</span>
              </span>
              <button
                onClick={handleResetSearch}
                className="text-[11px] text-rose-500 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Destination Dropdown */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Destination</label>
                <select
                  value={currentCriteria.destination || ''}
                  onChange={(e) => {
                    const dest = e.target.value;
                    processQuery(dest ? `Show stays in ${dest}` : 'Show all Northeast stays', {
                      destination: dest || undefined
                    });
                  }}
                  className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="">Any Northeast Destination</option>
                  {POPULAR_DESTINATIONS.filter(d => d !== 'All Northeast').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Guests Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Guests</label>
                <select
                  value={currentCriteria.guests || ''}
                  onChange={(e) => {
                    const g = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    processQuery(g ? `For ${g} guests` : '', { guests: g });
                  }}
                  className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="">Any Guests</option>
                  <option value="1">1 Guest (Solo)</option>
                  <option value="2">2 Guests (Couple)</option>
                  <option value="3">3 Guests</option>
                  <option value="4">4 Guests (Family)</option>
                  <option value="5">5+ Guests (Group)</option>
                </select>
              </div>

              {/* Budget Limit */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Max Budget</label>
                <select
                  value={currentCriteria.maxBudget || ''}
                  onChange={(e) => {
                    const b = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    processQuery(b ? `Under ₹${b} per night` : '', { maxBudget: b });
                  }}
                  className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="">Any Budget</option>
                  <option value="1500">Under ₹1,500</option>
                  <option value="2000">Under ₹2,000</option>
                  <option value="3000">Under ₹3,000</option>
                  <option value="5000">Under ₹5,000</option>
                </select>
              </div>

              {/* Property Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Stay Type</label>
                <select
                  value={currentCriteria.propertyType || ''}
                  onChange={(e) => {
                    const t = e.target.value || undefined;
                    processQuery(t ? `${t} only` : '', { propertyType: t });
                  }}
                  className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="">All Stay Types</option>
                  <option value="Homestay">Homestay / Stilt</option>
                  <option value="Cottage">Eco Cottage</option>
                  <option value="Resort">Resort</option>
                  <option value="Hotel">Hotel</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages Container */}
        <div className="flex-1 overflow-y-auto py-3 px-1 space-y-4 my-2 scroll-smooth">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[90%] sm:max-w-[85%] space-y-3 ${
                  m.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm p-3.5 text-xs sm:text-sm font-medium shadow-md leading-relaxed'
                    : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm p-3.5 sm:p-4 text-xs sm:text-sm border border-slate-200 dark:border-slate-700/70 shadow-sm leading-relaxed'
                }`}
              >
                {/* Message Text */}
                <div className="whitespace-pre-line leading-relaxed">
                  {m.text}
                </div>

                {/* Grounded Property Match Cards */}
                {m.properties && m.properties.length > 0 && (
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-200 dark:border-slate-700">
                      <span>{m.isFallback ? 'Closest Available Northeast Stays:' : 'Matching THIKANA Stays:'}</span>
                      <span>{m.properties.length} Options</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {m.properties.map((match) => {
                        const prop = match.property;
                        const coverImg = prop.photos?.[0] || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80';
                        
                        return (
                          <div
                            key={prop.id}
                            className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row gap-3 overflow-hidden"
                          >
                            {/* Thumbnail */}
                            <div className="sm:w-36 h-28 sm:h-auto rounded-xl overflow-hidden relative shrink-0 bg-slate-200 dark:bg-slate-800">
                              <img
                                src={coverImg}
                                alt={prop.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute top-1.5 left-1.5 bg-slate-950/70 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                                {prop.propertyType}
                              </div>
                              {prop.isVerified && (
                                <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-[9px] font-bold p-1 rounded-full shadow">
                                  <ShieldCheck className="w-3 h-3" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 flex flex-col justify-between space-y-1.5">
                              <div>
                                <div className="flex items-start justify-between gap-1">
                                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight line-clamp-1">
                                    {prop.title}
                                  </h4>
                                  <div className="flex items-center gap-0.5 text-amber-500 text-xs font-bold shrink-0">
                                    <Star className="w-3 h-3 fill-amber-500" />
                                    <span>{prop.rating || 5.0}</span>
                                  </div>
                                </div>

                                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{prop.city}, {prop.state}</span>
                                  {match.distanceNote && (
                                    <span className="text-slate-400">• {match.distanceNote}</span>
                                  )}
                                </p>
                              </div>

                              {/* Key highlights & Match Reason */}
                              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium leading-tight">
                                💡 {match.matchReason}
                              </div>

                              {/* Amenities / Features */}
                              <div className="flex flex-wrap gap-1 text-[10px]">
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                  <Users className="w-2.5 h-2.5" /> Max {match.maxCapacity} Guests
                                </span>
                                {match.amenities.slice(0, 3).map((am, i) => (
                                  <span key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                                    {am}
                                  </span>
                                ))}
                              </div>

                              {/* Price & Action Buttons */}
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Starts at</span>
                                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                    ₹{match.startingPrice} <span className="text-[10px] text-slate-500 font-normal">/ night</span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleViewPropertyDetails(match)}
                                    className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                                    title="View full property details & rooms"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Details</span>
                                  </button>

                                  <button
                                    onClick={() => handleDirectWhatsApp(match)}
                                    className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                                    title={`Connect directly with host ${prop.ownerName} on WhatsApp`}
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 fill-white text-emerald-600" />
                                    <span>Book on WhatsApp</span>
                                  </button>
                                </div>
                              </div>

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {m.sender === 'user' && (
                <div className="w-8 h-8 rounded-2xl bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center shrink-0 mt-1 font-extrabold text-xs shadow-sm">
                  You
                </div>
              )}
            </div>
          ))}

          {/* Loading Animation State */}
          {loading && (
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
              <span>THIKANA AI Mitra is matching authentic stays & calculating best host options...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Suggestion Chips */}
        <div className="pt-2 pb-1 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="font-extrabold text-[10px] uppercase text-slate-400 shrink-0 flex items-center gap-0.5">
              <Sparkles className="w-3 h-3 text-emerald-500" /> Quick:
            </span>
            {SUGGESTED_QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickAction(action.query)}
                className="bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 hover:text-emerald-900 dark:hover:bg-emerald-950 dark:hover:text-emerald-300 text-slate-700 dark:text-slate-300 font-bold px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors border border-slate-200 dark:border-slate-700/60 cursor-pointer shrink-0"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Form with Voice & Send */}
        <form onSubmit={handleSend} className="pt-2 flex items-center gap-2 shrink-0">
          <div className="flex-1 relative flex items-center">
            <input
              type="text"
              placeholder="e.g. 2 guests in Kaziranga under ₹1500 near safari gate..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl pl-3.5 pr-10 py-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-inner"
            />
            {/* Voice input button */}
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`absolute right-2.5 p-1.5 rounded-xl text-slate-400 hover:text-emerald-600 transition-colors ${
                isListening ? 'text-rose-500 animate-pulse' : ''
              }`}
              title={isListening ? 'Listening...' : 'Voice Search'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white p-3 sm:px-5 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-lg active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <span className="hidden sm:inline">Search</span>
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
};
