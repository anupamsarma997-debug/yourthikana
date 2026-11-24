import React, { useState } from 'react';
import { Property, RoomType } from '../types';
import { store } from '../services/store';
import { isBlueTickActive, isSearchBoostActive } from '../utils/propertyBadges';
import { 
  BadgeCheck, 
  Star, 
  MapPin, 
  Users, 
  Wifi, 
  Coffee, 
  ChevronRight, 
  MessageCircle,
  PlayCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  rooms?: RoomType[];
  isPriority?: boolean;
  onSelect: (property: Property) => void;
  onOpenWhatsApp: (property: Property, room?: RoomType) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  rooms: suppliedRooms,
  isPriority = false,
  onSelect,
  onOpenWhatsApp,
}) => {
  // Reuse the homepage's pre-indexed rooms to avoid rescanning all rooms per card.
  const rooms = (Array.isArray(suppliedRooms) ? suppliedRooms : store.getRoomsByProperty(property.id)).filter(Boolean);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Compare the actual customer price (valid discount first), not only the base rate.
  const effectiveRoomPrice = (room: RoomType) =>
    room.discountPrice && room.discountPrice > 0 &&
    room.pricePerNight > 0 && room.discountPrice < room.pricePerNight
      ? room.discountPrice
      : room.pricePerNight;
  const pricedRooms = rooms.filter((room) => Number.isFinite(room.pricePerNight) && room.pricePerNight > 0);
  const lowestPriceRoom = pricedRooms.length > 0
    ? pricedRooms.reduce((min, room) =>
        effectiveRoomPrice(room) < effectiveRoomPrice(min) ? room : min, pricedRooms[0])
    : null;
  const primaryRoom = lowestPriceRoom || rooms[0] || null;
  const currentPrice = lowestPriceRoom
    ? (lowestPriceRoom.discountPrice && lowestPriceRoom.discountPrice > 0 && lowestPriceRoom.discountPrice < lowestPriceRoom.pricePerNight
        ? lowestPriceRoom.discountPrice
        : lowestPriceRoom.pricePerNight)
    : null;
  const originalPrice = lowestPriceRoom?.discountPrice && lowestPriceRoom.discountPrice < lowestPriceRoom.pricePerNight
    ? lowestPriceRoom.pricePerNight
    : null;

  const photos = Array.isArray(property.photos) ? property.photos.filter((photo) => typeof photo === 'string' && photo.length > 0) : [];
  const coverImage = photos.length > 0 ? (photos[activePhotoIdx] || photos[0]) : null;

  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
      className="bg-white dark:bg-slate-800/90 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group relative"
    >
      
      {/* Top Media Banner */}
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
        {coverImage ? (
          <img
            src={coverImage}
            alt={property.title ? `Photo of ${property.title}` : 'Property accommodation photo'}
            width={800}
            height={500}
            decoding="async"
            fetchPriority={isPriority ? "high" : "auto"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading={isPriority ? "eager" : "lazy"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-300 text-xs font-semibold">
            Host photo not provided
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />

        {/* Top Badges Row */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isSearchBoostActive(property) && (
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                <Sparkles className="w-3 h-3 fill-slate-950" />
                Featured ⭐
              </span>
            )}
            <span className="bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-white/20">
              {property.propertyType}
            </span>
          </div>

          {isBlueTickActive(property) && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-md flex items-center gap-1 backdrop-blur-md">
              <BadgeCheck className="w-3.5 h-3.5 fill-white text-blue-600" />
              Verified Blue Tick
            </span>
          )}
        </div>

        {/* Video Icon Badge if property has video */}
        {property.videoUrl && (
          <div className="absolute bottom-3 left-3 bg-slate-900/80 text-white text-[10px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur-md flex items-center gap-1.5 border border-white/20">
            <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>10s Video Tour</span>
          </div>
        )}

        {/* Show a rating only when real reviews exist. */}
        <div className="absolute bottom-3 right-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md">
          {typeof property?.rating === 'number' && Number.isFinite(property.rating) && property.rating > 0 && property.rating <= 5 && Number(property.reviewsCount) > 0 ? (
            <span className="flex items-center gap-1 text-xs font-black">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              {property.rating.toFixed(1)} ({property.reviewsCount})
            </span>
          ) : 'No ratings yet'}
        </div>

        {/* Photo Switcher Dots */}
        {photos.length > 1 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
            {photos.slice(0, 5).map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Show photo ${idx + 1} of ${property.title || 'this property'}`}
                aria-pressed={activePhotoIdx === idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIdx(idx);
                }}
                className="w-11 h-11 inline-flex items-center justify-center rounded-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${activePhotoIdx === idx ? 'bg-white w-4' : 'bg-white/60 w-1.5'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Property Details Content */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Location & Title */}
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{property.city}, {property.state}</span>
          </div>

          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white line-clamp-1">
            <button
              type="button"
              onClick={() => onSelect(property)}
              className="w-full min-h-11 text-left hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              {property.title}
            </button>
          </h3>

          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-1.5 leading-relaxed">
            {property.description}
          </p>

          {/* Amenities & Room Highlight */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{primaryRoom?.maxGuests > 0 ? `Max ${primaryRoom.maxGuests} Guests` : 'Guest capacity not provided'}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>In {property.checkInTime}</span>
              </span>
            </div>

            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {rooms.length} Room Types
            </span>
          </div>
        </div>

        {/* Pricing & WhatsApp Direct Booking Action */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {currentPrice ? `₹${currentPrice}` : 'Price on request'}
              </span>
              {originalPrice && (
                <span className="text-xs text-slate-400 line-through font-medium">
                  ₹{originalPrice}
                </span>
              )}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {property.propertyType?.toLowerCase().includes('monthly') ? '/ month' : '/ night'}
              </span>
            </div>
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              0% Commission • Direct Owner Rate
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSelect(property)}
              className="min-h-11 min-w-11 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-all"
            >
              Details
            </button>
            <button
              onClick={() => onOpenWhatsApp(property, primaryRoom || undefined)}
              className="min-h-11 min-w-11 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-white text-emerald-600" />
              <span>Book on WhatsApp</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
