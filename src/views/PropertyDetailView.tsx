import React, { useState } from 'react';
import { Property, RoomType } from '../types';
import { store } from '../services/store';
import { MapLocationView } from '../components/MapLocationView';
import { BannerSlider } from '../components/BannerSlider';
import { 
  ArrowLeft, 
  MapPin, 
  Star, 
  BadgeCheck, 
  Sparkles, 
  PlayCircle, 
  Check, 
  Users, 
  Clock, 
  BedDouble, 
  MessageCircle, 
  Phone, 
  Mail, 
  Share2, 
  Calendar,
  Layers,
  Heart
} from 'lucide-react';

interface PropertyDetailViewProps {
  property: Property;
  onBack: () => void;
  onOpenWhatsApp: (property: Property, room?: RoomType) => void;
  onOpenGallery: (property: Property) => void;
}

export const PropertyDetailView: React.FC<PropertyDetailViewProps> = ({
  property,
  onBack,
  onOpenWhatsApp,
  onOpenGallery,
}) => {
  const rooms = store.getRoomsByProperty(property.id);
  const photos = property.photos || [];

  const [selectedRoom, setSelectedRoom] = useState<RoomType | undefined>(rooms[0]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: property.title,
        text: `Check out ${property.title} in ${property.city} on THIKANA! Book directly with zero commission on WhatsApp.`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Property link copied to clipboard!');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 px-3.5 py-2 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Homestays</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
            title="Share Property"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Property Title & Badges Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold px-3 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700">
            {property.propertyType}
          </span>

          {property.isFeatured && (
            <span className="bg-amber-400 text-slate-950 text-xs font-black px-3 py-1 rounded-lg shadow-sm flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
              ⭐ Featured Search Boost
            </span>
          )}

          {property.isVerified && (
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm flex items-center gap-1">
              <BadgeCheck className="w-4 h-4 fill-white text-blue-600" />
              Blue Verified Homestay
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight">
          {property.title}
        </h1>

        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 flex-wrap">
          <div className="flex items-center gap-1 font-extrabold text-slate-900 dark:text-white">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>{(typeof property?.rating === 'number' ? property.rating : 5.0).toFixed(1)}</span>
            <span className="text-slate-400 font-normal">({property?.reviewsCount ?? 0} customer reviews)</span>
          </div>

          <div className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <MapPin className="w-4 h-4" />
            <span>{property.address}, {property.city}, {property.state}</span>
          </div>
        </div>
      </div>

      {/* Photo & Video Grid Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-2">
        {/* Cover Main Photo */}
        <div 
          onClick={() => onOpenGallery(property)}
          className="md:col-span-2 aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-2xl relative group cursor-pointer"
        >
          <img
            src={photos[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 bg-slate-900/80 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/20">
            Cover Photo
          </div>
        </div>

        {/* Secondary Photos */}
        <div 
          onClick={() => onOpenGallery(property)}
          className="hidden md:block aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-2xl relative group cursor-pointer"
        >
          <img
            src={photos[1] || photos[0]}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>

        {/* Video / Gallery Trigger Photo */}
        <div 
          onClick={() => onOpenGallery(property)}
          className="hidden md:block aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-2xl relative group cursor-pointer bg-slate-800"
        >
          <img
            src={photos[2] || photos[0]}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
          />
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-2">
            {property.videoUrl ? (
              <div className="space-y-1">
                <PlayCircle className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                <p className="text-xs font-extrabold text-white">Watch 10s Video Tour</p>
                <p className="text-[10px] text-slate-300">+ View {photos.length} Photos</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Layers className="w-8 h-8 text-white mx-auto" />
                <p className="text-xs font-bold text-white">View All {photos.length} Photos</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content & Right Sidebar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-2">
        
        {/* Left Column: Details, Rooms, Map */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Check-in/Out & Quick Info Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-medium">Check-in Time</p>
              <p className="font-extrabold text-slate-900 dark:text-white mt-0.5">{property.checkInTime}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Check-out Time</p>
              <p className="font-extrabold text-slate-900 dark:text-white mt-0.5">{property.checkOutTime}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Property Type</p>
              <p className="font-extrabold text-slate-900 dark:text-white mt-0.5">{property.propertyType}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Direct Booking</p>
              <p className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">0% Commission</p>
            </div>
          </div>

          {/* Property Description (Unlimited Text) */}
          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              About this Homestay / Hotel
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-normal">
              {property.description}
            </p>
          </div>

          {/* Room Types List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BedDouble className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Available Room Types ({rooms.length})</span>
              </h3>
            </div>

            <div className="space-y-3">
              {rooms.map((room) => {
                const effectivePrice = room.discountPrice || room.pricePerNight;
                const isSelected = selectedRoom?.id === room.id;

                return (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                            {room.roomName}
                          </h4>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-semibold">
                            {room.roomSize}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          {room.description}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>🛏️ {room.bedType}</span>
                          <span>👥 Max {room.maxGuests} Guests</span>
                        </div>

                        {/* Room Amenities Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-3">
                          {room.amenities.map((am, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md font-medium"
                            >
                              ✓ {am}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700">
                        <div className="flex items-baseline gap-1.5 sm:justify-end">
                          <span className="text-xl font-black text-slate-900 dark:text-white">
                            ₹{effectivePrice}
                          </span>
                          {room.discountPrice && (
                            <span className="text-xs text-slate-400 line-through">
                              ₹{room.pricePerNight}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-medium">
                            {property.propertyType?.toLowerCase().includes('monthly') ? '/ month' : '/ night'}
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenWhatsApp(property, room);
                          }}
                          className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5 fill-white text-emerald-600" />
                          <span>Book This Room</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Location Map Component */}
          <MapLocationView property={property} />

          {/* Banner Ad spot */}
          <BannerSlider position="property" />

        </div>

        {/* Right Sticky Sidebar: Direct WhatsApp Booking Box */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xl sticky top-20 space-y-5">
            
            <div className="pb-4 border-b border-slate-100 dark:border-slate-700">
              <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">
                Direct Host Contact
              </span>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  ₹{selectedRoom ? (selectedRoom.discountPrice || selectedRoom.pricePerNight) : 1500}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {property.propertyType?.toLowerCase().includes('monthly') ? '/ month starting rent' : '/ night starting price'}
                </span>
              </div>
            </div>

            {/* Owner Contact Card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                  {property.ownerName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {property.ownerName}
                    </h4>
                    {property.isVerified && (
                      <BadgeCheck className="w-4 h-4 text-blue-600 fill-white" />
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Property Owner • Fast WhatsApp Response
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{property.ownerPhone}</span>
                </p>
                <p className="flex items-center gap-2">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>WhatsApp: {property.ownerWhatsApp || property.ownerPhone}</span>
                </p>
              </div>
            </div>

            {/* Direct WhatsApp Call to Action Button */}
            <button
              onClick={() => onOpenWhatsApp(property, selectedRoom)}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm py-3.5 px-4 rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-white text-emerald-600" />
              <span>Chat & Book on WhatsApp</span>
            </button>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 text-center font-medium">
              <p>✓ 100% Zero Commission Guarantee</p>
              <p>✓ Direct owner pricing & room availability</p>
              <p>✓ Safe direct negotiation</p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
