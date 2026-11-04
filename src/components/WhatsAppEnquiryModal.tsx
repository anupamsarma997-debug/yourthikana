import React, { useState, useEffect } from 'react';
import { Property, RoomType } from '../types';
import { store } from '../services/store';
import { getEffectiveRoomPrice } from '../utils/roomPricing';
import { 
  X, 
  MessageCircle, 
  Calendar, 
  Users, 
  BedDouble, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  DollarSign, 
  
} from 'lucide-react';

interface WhatsAppEnquiryModalProps {
  property: Property | null;
  initialRoom?: RoomType;
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppEnquiryModal: React.FC<WhatsAppEnquiryModalProps> = ({
  property,
  initialRoom,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !property) return null;

  const rooms = store.getRoomsByProperty(property.id);
  const currentUser = store.getCurrentUser();

  // Form States
  const [customerName, setCustomerName] = useState(currentUser?.name || '');

  // Default dates: Today & 2 days later
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultCheckOut = new Date();
  defaultCheckOut.setDate(defaultCheckOut.getDate() + 2);
  const checkOutStr = defaultCheckOut.toISOString().split('T')[0];

  const [checkInDate, setCheckInDate] = useState(todayStr);
  const [checkOutDate, setCheckOutDate] = useState(checkOutStr);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    initialRoom ? initialRoom.id : (rooms[0]?.id || '')
  );
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    if (initialRoom) {
      setSelectedRoomId(initialRoom.id);
    } else if (rooms.length > 0) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [initialRoom, property]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

  // A stay is charged by nights (check-out date is not an extra night).
  const calculateNights = () => {
    const checkIn = new Date(`${checkInDate}T00:00:00`).getTime();
    const checkOut = new Date(`${checkOutDate}T00:00:00`).getTime();
    const nights = (checkOut - checkIn) / (24 * 60 * 60 * 1000);
    return Number.isInteger(nights) && nights > 0 ? nights : 0;
  };

  const numberOfNights = calculateNights();
  const isMonthly = property.propertyType?.toLowerCase().includes('monthly');
  const roomPrice = selectedRoom ? getEffectiveRoomPrice(selectedRoom) : 0;
  const calculatedTotal = selectedRoom && roomPrice > 0
    ? (isMonthly ? roomPrice : roomPrice * numberOfNights)
    : 0;

  // Format WhatsApp Message
  const constructMessage = () => {
    const totalGuests = adults + children;
    return `Hello ${property.ownerName}, I found your property *${property.title}* on THIKANA.

📋 *Booking Enquiry Form:*
👤 *Name:* ${customerName || 'Guest'}
🗓️ *Check-in Date:* ${checkInDate}
🗓️ *Check-out Date:* ${checkOutDate} (${numberOfNights} Nights)
👥 *Guests:* ${adults} Adults${children > 0 ? `, ${children} Children` : ''} (Total ${totalGuests})
🛏️ *Room Type:* ${selectedRoom ? selectedRoom.roomName : 'Standard Room'} (₹${roomPrice}/${isMonthly ? 'month' : 'night'})
💰 *Estimated Total:* ₹${calculatedTotal}

${specialRequests ? `📝 *Special Request:* ${specialRequests}\n` : ''}I want to book this room. Please confirm room availability and payment details. Thank you!`;
  };

  const handleSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (!selectedRoom || roomPrice <= 0) {
      alert('This property has no valid room price yet. Please contact the host.');
      return;
    }
    if (numberOfNights <= 0) {
      alert('Please select a check-out date after the check-in date.');
      return;
    }
    let cleanPhone = (property.ownerWhatsApp || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    if (cleanPhone.length < 12 || cleanPhone.length > 15) {
      alert('The host has not added a valid WhatsApp contact yet. Please contact the property through its listed contact options.');
      return;
    }

    const message = constructMessage();

    // Log enquiry in store
    store.addEnquiry({
      propertyId: property.id,
      propertyName: property.title,
      ownerId: property.ownerId,
      ownerName: property.ownerName,
      ownerWhatsApp: property.ownerWhatsApp,
      customerName,
      checkInDate,
      checkOutDate,
      numberOfDays: numberOfNights,
      numberOfNights,
      adults,
      children,
      totalGuests: adults + children,
      selectedRoomId: selectedRoom?.id || '',
      selectedRoomName: selectedRoom ? selectedRoom.roomName : 'Standard Room',
      pricePerNight: roomPrice,
      calculatedTotal,
      specialRequests,
      formattedMessage: message,
    });

    // Track Lead for QR referral & conversion analytics
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlRef = urlParams ? (urlParams.get('ref') || urlParams.get('refId')) : null;
    const savedRef = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('thikana_current_refId') : null;
    const activeRefId = urlRef || savedRef || 'direct';
    const source = activeRefId !== 'direct' ? 'qr_referral' : 'whatsapp';
    store.trackLead(property.id, activeRefId, customerName, source);

    const encodedText = encodeURIComponent(message);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    setIsSent(true);

    // Open WhatsApp
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-700">
            <MessageCircle className="w-6 h-6 fill-emerald-600 text-emerald-100 dark:fill-emerald-400 dark:text-slate-900" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              0% Commission Direct WhatsApp Booking
            </span>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
              Fill Booking Enquiry Form
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {property.title} ({property.city})
            </p>
          </div>
        </div>

        {isSent ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-xl font-black text-slate-900 dark:text-white">
              WhatsApp Opened!
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              Your booking enquiry details have been prefilled. Send the message directly to host <strong className="text-emerald-600 dark:text-emerald-400">{property.ownerName}</strong> on WhatsApp.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  let cleanPhone = (property.ownerWhatsApp || '').replace(/\D/g, '');
                  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
                  if (cleanPhone.length >= 12 && cleanPhone.length <= 15) {
                    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(constructMessage())}`, '_blank');
                  }
                }}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Re-open WhatsApp</span>
              </button>

              <button
                onClick={onClose}
                className="w-full sm:w-auto bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold px-6 py-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Close Modal
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendWhatsApp} className="space-y-4">
            
            {/* Guest name only; phone number is not collected. */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Your Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Your name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Dates Selection (Check-in / Check-out) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Check-in Date</span>
                </label>
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Check-out Date</span>
                </label>
                <input
                  type="date"
                  required
                  min={checkInDate}
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Room Type Selector & Guests */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Room Type</span>
                </label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomName} ({getEffectiveRoomPrice(r) > 0 ? `₹${getEffectiveRoomPrice(r)}` : 'Price not set'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Adults (12+ yrs)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={adults}
                  onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Children (Below 12)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={children}
                  onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Special Requests */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Special Requests / Extra Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Need early check-in, heater in room, or local cab pickup..."
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Calculation Summary Card */}
            <div className="bg-slate-100 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Stay Duration:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {numberOfNights} Night{numberOfNights === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Room Rate:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ₹{roomPrice} / {isMonthly ? 'month' : 'night'}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900 dark:text-white">Estimated Total:</span>
                <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
                  ₹{calculatedTotal}
                </span>
              </div>
            </div>

            {/* Host Info Box */}
            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-slate-900 dark:text-white">
                  Host: {property.ownerName}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Your enquiry will be sent directly to their WhatsApp. Pay host directly at check-in with 0% platform fee.
                </p>
              </div>
            </div>

            {/* Send WhatsApp CTA Button */}
            <button
              type="submit"
              disabled={!selectedRoom || roomPrice <= 0 || !property.ownerWhatsApp || numberOfNights <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <MessageCircle className="w-5 h-5 fill-white text-emerald-600" />
              <span>Send Enquiry on Owner WhatsApp</span>
            </button>

          </form>
        )}

      </div>
    </div>
  );
};
