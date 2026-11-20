import { Property } from '../types';

export const isBlueTickActive = (property: Pick<Property, 'isVerified' | 'verifiedUntil'>): boolean =>
  Boolean(property.isVerified && property.verifiedUntil && Date.parse(property.verifiedUntil) > Date.now());

export const isSearchBoostActive = (property: Pick<Property, 'isFeatured' | 'featuredUntil'>): boolean =>
  Boolean(property.isFeatured && property.featuredUntil && Date.parse(property.featuredUntil) > Date.now());
