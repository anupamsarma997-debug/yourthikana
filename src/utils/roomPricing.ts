import { RoomType } from '../types';

/**
 * A discount is valid only when it is a positive amount below the original rate.
 * Invalid, empty, stale, or string-valued legacy discounts never override the base price.
 */
export function hasValidRoomDiscount(room: Pick<RoomType, 'pricePerNight' | 'discountPrice'>): boolean {
  const basePrice = Number(room.pricePerNight);
  const discountPrice = Number(room.discountPrice);
  return Number.isFinite(basePrice) &&
    Number.isFinite(discountPrice) &&
    basePrice > 0 &&
    discountPrice > 0 &&
    discountPrice < basePrice;
}

export function getEffectiveRoomPrice(room: Pick<RoomType, 'pricePerNight' | 'discountPrice'>): number {
  const basePrice = Number(room.pricePerNight);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return 0;
  return hasValidRoomDiscount(room) ? Number(room.discountPrice) : basePrice;
}
