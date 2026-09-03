export type UserRole = 'customer' | 'owner' | 'admin';

export interface User {
  id: string;
  name: string;
  username?: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  googleEmail?: string;
  googleUid?: string;
  isGoogleUser?: boolean;
  email: string;
  phone: string;
  whatsapp: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'pending_approval' | 'blocked';
}

export type PropertyType = 
  | 'Homestay' 
  | 'Hotel' 
  | 'Resort' 
  | 'Villa' 
  | 'Cottage'
  | 'Monthly Room'
  | 'Monthly Rooms'
  | 'PG / Hostel'
  | 'PG'
  | 'Hostel';

export interface RoomType {
  id: string;
  propertyId: string;
  ownerId?: string;
  ownerUid?: string;
  ownerEmail?: string;
  roomName: string;
  pricePerNight: number;
  discountPrice?: number;
  maxGuests: number;
  description: string;
  amenities: string[];
  roomSize: string; // e.g. "250 sq.ft."
  bedType: string;  // e.g. "King Size Bed", "Twin Bed"
  photos?: string[];
}

export interface Property {
  id: string;
  ownerId: string;
  ownerUid?: string;
  ownerEmail?: string;
  ownerName: string;
  ownerPhone: string;
  ownerWhatsApp: string;
  title: string;
  description: string; // Unlimited character limit
  propertyType: PropertyType;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  googleMapUrl?: string;
  nearbyAttractions?: string[];
  checkInTime: string; // e.g. "12:00 PM"
  checkOutTime: string; // e.g. "11:00 AM"
  photos: string[]; // Up to 20 Photos
  videoUrl?: string; // 10-second property video URL
  coverImage?: string;
  rating: number;
  reviewsCount: number;
  isVerified: boolean; // Blue Verified Badge (₹500/mo)
  isFeatured: boolean; // Search Boost (₹500/mo)
  status: 'active' | 'pending' | 'rejected' | 'hidden_expired' | 'blocked';
  subscriptionPlan: 'standard_1000' | 'standard_1500' | 'none';
  subscriptionPrice: number;
  subscriptionExpiresAt: string;
  subscriptionExpiryDate?: string;
  createdAt: string;
}

export interface BookingEnquiry {
  id: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  ownerName: string;
  ownerWhatsApp: string;
  customerName: string;
  customerPhone: string;
  customerWhatsApp: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfDays: number;
  adults: number;
  children: number;
  totalGuests: number;
  selectedRoomId: string;
  selectedRoomName: string;
  pricePerNight: number;
  calculatedTotal: number;
  specialRequests?: string;
  formattedMessage: string;
  sentAt?: string;
  createdAt?: string;
}

export interface BannerAd {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  targetUrl: string;
  ctaText?: string;
  position: 'home' | 'search' | 'property';
  isActive: boolean;
}

export interface SubscriptionTransaction {
  id: string;
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  type: 'standard_1000' | 'standard_1500' | 'verified_badge' | 'search_boost';
  planName: string;
  title?: string;
  amount: number;
  date: string;
  validUntil?: string;
  createdAt?: string;
}

export interface PropertyVisit {
  id: string;
  propertyId: string;
  refId: string;
  timestamp: string;
  source?: 'qr_referral' | 'direct' | 'search';
}

export interface PropertyLead {
  id: string;
  propertyId: string;
  refId: string;
  customerName?: string;
  timestamp: string;
  source?: 'qr_referral' | 'direct' | 'whatsapp';
}

