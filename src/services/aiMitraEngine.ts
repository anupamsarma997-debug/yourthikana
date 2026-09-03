import { Property, RoomType } from '../types';
import { store } from './store';

export interface MitraSearchCriteria {
  destination?: string;
  state?: string;
  guests?: number;
  maxBudget?: number;
  minBudget?: number;
  propertyType?: string;
  amenities?: string[];
  nearAttraction?: string;
  checkIn?: string;
  checkOut?: string;
  tripType?: 'solo' | 'couple' | 'family' | 'group' | 'safari' | 'trekking' | 'peaceful' | 'general';
}

export interface MitraPropertyMatch {
  property: Property;
  startingPrice: number;
  matchingRooms: RoomType[];
  maxCapacity: number;
  amenities: string[];
  score: number;
  matchReason: string;
  distanceNote?: string;
  isExactLocationMatch: boolean;
  isBudgetMatch: boolean;
  isGuestMatch: boolean;
}

export interface MitraSearchResult {
  criteria: MitraSearchCriteria;
  matches: MitraPropertyMatch[];
  isExactMatch: boolean;
  explanation: string;
  missingFields: string[];
  suggestedPrompts: string[];
}

// Known Northeast locations and aliases
const KNOWN_LOCATIONS: Record<string, { city: string; state: string; aliases: string[]; attractions: string[] }> = {
  kaziranga: {
    city: 'Kaziranga',
    state: 'Assam',
    aliases: ['kaziranga', 'kohora', 'bagori', 'safari', 'rhino', 'kaziranga safari gate'],
    attractions: ['Kaziranga Safari Gate', 'Orchid Park', 'Kakochang Waterfall', 'Kohora']
  },
  cherrapunji: {
    city: 'Cherrapunji',
    state: 'Meghalaya',
    aliases: ['sohra', 'cherrapunji', 'cherrapunjee', 'nohkalikai', 'living root bridge', 'nongriat', 'seven sisters falls'],
    attractions: ['Nohkalikai Waterfall', 'Living Root Bridges', 'Seven Sisters Falls', 'Mawsmai Cave']
  },
  tawang: {
    city: 'Tawang',
    state: 'Arunachal Pradesh',
    aliases: ['tawang', 'monastery', 'sela pass', 'madhuri lake', 'monpa'],
    attractions: ['Tawang Monastery', 'Sela Pass', 'Madhuri Lake', 'War Memorial']
  },
  majuli: {
    city: 'Majuli Island',
    state: 'Assam',
    aliases: ['majuli', 'majuli island', 'mishing', 'xatra', 'garmur', 'kamalabari', 'river island'],
    attractions: ['Auniati Xatra', 'Kamalabari Xatra', 'Mask Making Village', 'Brahmaputra Sunset Ghat']
  },
  kohima: {
    city: 'Kohima',
    state: 'Nagaland',
    aliases: ['kohima', 'dzukou', 'dzukou valley', 'viswema', 'kisama', 'hornbill', 'angami', 'naga'],
    attractions: ['Dzukou Valley Trek', 'Kisama Heritage Village', 'War Cemetery']
  },
  gangtok: {
    city: 'Gangtok',
    state: 'Sikkim',
    aliases: ['gangtok', 'sikkim', 'kanchenjunga', 'mg marg', 'rumtek', 'tsomgo'],
    attractions: ['MG Marg', 'Rumtek Monastery', 'Kanchenjunga View', 'Tsomgo Lake']
  },
  shillong: {
    city: 'Shillong',
    state: 'Meghalaya',
    aliases: ['shillong', 'scotland of the east', 'police bazar', 'elephant falls', 'umiam lake', 'laitlum'],
    attractions: ['Elephant Falls', 'Umiam Lake', 'Police Bazar', 'Laitlum Canyons']
  },
  guwahati: {
    city: 'Guwahati',
    state: 'Assam',
    aliases: ['guwahati', 'kamakhya', 'paltan bazar', 'brahmaputra', 'khanapara', 'dispur'],
    attractions: ['Kamakhya Temple', 'Brahmaputra River Cruise', 'Pobitora']
  },
  dawki: {
    city: 'Dawki',
    state: 'Meghalaya',
    aliases: ['dawki', 'umngot', 'shnongpdeng', 'crystal river', 'boating'],
    attractions: ['Umngot River', 'Shnongpdeng Camping', 'Indo-Bangla Border']
  },
  ziro: {
    city: 'Ziro Valley',
    state: 'Arunachal Pradesh',
    aliases: ['ziro', 'ziro valley', 'apatani', 'music festival', 'paddy fields'],
    attractions: ['Apatani Tribal Villages', 'Pine Groves', 'Tarin Fish Farm']
  }
};

/**
 * Extract intent and search criteria from natural text
 */
export function extractCriteriaFromText(text: string, previousCriteria: MitraSearchCriteria = {}): MitraSearchCriteria {
  const q = text.toLowerCase();
  const criteria: MitraSearchCriteria = { ...previousCriteria };

  // 1. Destination Extraction
  for (const [key, loc] of Object.entries(KNOWN_LOCATIONS)) {
    if (loc.aliases.some((alias) => q.includes(alias))) {
      criteria.destination = loc.city;
      criteria.state = loc.state;
      break;
    }
  }

  // Check generic state matches if city not found
  if (!criteria.destination) {
    if (q.includes('assam')) criteria.state = 'Assam';
    else if (q.includes('meghalaya')) criteria.state = 'Meghalaya';
    else if (q.includes('arunachal')) criteria.state = 'Arunachal Pradesh';
    else if (q.includes('sikkim')) criteria.state = 'Sikkim';
    else if (q.includes('nagaland')) criteria.state = 'Nagaland';
    else if (q.includes('mizoram')) criteria.state = 'Mizoram';
    else if (q.includes('manipur')) criteria.state = 'Manipur';
    else if (q.includes('tripura')) criteria.state = 'Tripura';
  }

  // 2. Budget Extraction (e.g. "under 1500", "below ₹2000", "budget 1800", "1500 per night", "cheap", "cheapest")
  const budgetMatch = q.match(/(?:under|below|less than|max|budget(?: of)?|within|around|₹|rs\.?|inr)\s*(\d{3,5})/i) ||
                      q.match(/(\d{3,5})\s*(?:rs|rupees|inr|\/night|per night|tak|k)/i);
  if (budgetMatch && budgetMatch[1]) {
    const num = parseInt(budgetMatch[1], 10);
    if (num > 300 && num <= 50000) {
      criteria.maxBudget = num;
    }
  } else if (q.includes('cheap') || q.includes('cheapest') || q.includes('sasta') || q.includes('low budget') || q.includes('pocket friendly')) {
    criteria.maxBudget = 1500;
  }

  // 3. Guest Count Extraction (e.g. "for 2 people", "2 guests", "3 adults", "family of 4", "solo", "couple")
  const guestMatch = q.match(/(\d+)\s*(?:people|persons|guests|adults|members|log|jan)/i) ||
                     q.match(/(?:family of|group of)\s*(\d+)/i);
  if (guestMatch && guestMatch[1]) {
    criteria.guests = parseInt(guestMatch[1], 10);
  } else if (q.includes('solo') || q.includes('alone') || q.includes('single') || q.includes('akela')) {
    criteria.guests = 1;
    criteria.tripType = 'solo';
  } else if (q.includes('couple') || q.includes('two of us') || q.includes('honeymoon') || q.includes('do log')) {
    criteria.guests = 2;
    criteria.tripType = 'couple';
  } else if (q.includes('family') || q.includes('parivar') || q.includes('bachhe') || q.includes('kids')) {
    if (!criteria.guests || criteria.guests < 3) criteria.guests = 4;
    criteria.tripType = 'family';
  }

  // 4. Property Type Extraction
  if (q.includes('homestay') || q.includes('home stay') || q.includes('stilt') || q.includes('chang ghar')) {
    criteria.propertyType = 'Homestay';
  } else if (q.includes('resort')) {
    criteria.propertyType = 'Resort';
  } else if (q.includes('cottage') || q.includes('cabin')) {
    criteria.propertyType = 'Cottage';
  } else if (q.includes('hotel')) {
    criteria.propertyType = 'Hotel';
  } else if (q.includes('villa')) {
    criteria.propertyType = 'Villa';
  } else if (q.includes('pg') || q.includes('hostel') || q.includes('paying guest')) {
    criteria.propertyType = 'PG / Hostel';
  } else if (q.includes('monthly') || q.includes('month') || q.includes('rent')) {
    criteria.propertyType = 'Monthly Room';
  }

  // 5. Trip Type / Vibe / Preferences
  if (q.includes('safari') || q.includes('rhino') || q.includes('elephant') || q.includes('jungle')) {
    criteria.tripType = 'safari';
    criteria.nearAttraction = criteria.nearAttraction || 'Safari Gate';
  } else if (q.includes('trek') || q.includes('hike') || q.includes('trail') || q.includes('dzukou')) {
    criteria.tripType = 'trekking';
  } else if (q.includes('peaceful') || q.includes('quiet') || q.includes('nature') || q.includes('scenic') || q.includes('calm')) {
    criteria.tripType = 'peaceful';
  }

  // 6. Amenities & Features Extraction
  const detectedAmenities: string[] = criteria.amenities ? [...criteria.amenities] : [];
  if (q.includes('wifi') && !detectedAmenities.includes('WiFi')) detectedAmenities.push('WiFi');
  if ((q.includes('geyser') || q.includes('hot water') || q.includes('garm pani')) && !detectedAmenities.includes('Geyser')) detectedAmenities.push('Geyser');
  if ((q.includes('mountain view') || q.includes('view') || q.includes('pahar') || q.includes('mist')) && !detectedAmenities.includes('View')) detectedAmenities.push('View');
  if ((q.includes('fireplace') || q.includes('heater') || q.includes('bukhari') || q.includes('bonfire')) && !detectedAmenities.includes('Heater')) detectedAmenities.push('Fireplace/Heater');
  if ((q.includes('breakfast') || q.includes('food') || q.includes('meal') || q.includes('khana') || q.includes('thali')) && !detectedAmenities.includes('Meals')) detectedAmenities.push('Meals');
  if (detectedAmenities.length > 0) {
    criteria.amenities = detectedAmenities;
  }

  // 7. Nearby Attraction / Specific Landmark Request
  if (q.includes('safari gate') || q.includes('kohora gate')) criteria.nearAttraction = 'Kaziranga Safari Gate';
  else if (q.includes('nohkalikai') || q.includes('waterfall') || q.includes('jharna')) criteria.nearAttraction = 'Nohkalikai Waterfall';
  else if (q.includes('monastery') || q.includes('gompa')) criteria.nearAttraction = 'Monastery';
  else if (q.includes('river') || q.includes('brahmaputra') || q.includes('island')) criteria.nearAttraction = 'Riverfront';
  else if (q.includes('root bridge') || q.includes('living root')) criteria.nearAttraction = 'Living Root Bridge';

  // 8. Dates extraction if mentioned (e.g. "12 sept to 14 sept", "tomorrow", "next weekend")
  const dateRangeMatch = q.match(/(\d{1,2}\s+[a-z]{3,9})\s*(?:to|-|till)\s*(\d{1,2}\s+[a-z]{3,9})/i);
  if (dateRangeMatch) {
    criteria.checkIn = dateRangeMatch[1];
    criteria.checkOut = dateRangeMatch[2];
  }

  return criteria;
}

/**
 * Search and rank authentic THIKANA listings based on extracted criteria
 */
export function searchAndRankProperties(
  allProperties: Property[],
  criteria: MitraSearchCriteria,
  userQuery = ''
): MitraSearchResult {
  const activeProps = (allProperties || []).filter((p) => p && p.status === 'active');
  const qLower = userQuery.toLowerCase();

  // Score each property based on multiple matching factors
  const scoredMatches: MitraPropertyMatch[] = activeProps.map((prop) => {
    const rooms = store.getRoomsByProperty(prop.id) || [];
    
    // Calculate starting price & valid capacity
    const roomPrices = rooms
      .map((r) => r.discountPrice || r.pricePerNight)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    const startingPrice = roomPrices.length > 0 ? Math.min(...roomPrices) : 1500;

    const maxCapacity = rooms.length > 0 
      ? Math.max(...rooms.map((r) => r.maxGuests || 2))
      : 2;

    // Collect all amenities across rooms & property description
    const allAmenitiesSet = new Set<string>();
    rooms.forEach((r) => (r.amenities || []).forEach((a) => allAmenitiesSet.add(a)));
    if (prop.description) {
      ['WiFi', 'Geyser', 'Fireplace', 'View', 'Breakfast', 'Bonfire', 'Balcony', 'Parking'].forEach((am) => {
        if (prop.description.toLowerCase().includes(am.toLowerCase())) {
          allAmenitiesSet.add(am);
        }
      });
    }
    const amenitiesList = Array.from(allAmenitiesSet);

    let score = 0;
    const matchReasons: string[] = [];
    let isExactLocationMatch = false;
    let isBudgetMatch = true;
    let isGuestMatch = true;

    // 1. Destination / State / City Match (Max 50 points)
    const pCity = (prop.city || '').toLowerCase();
    const pState = (prop.state || '').toLowerCase();
    const pTitle = (prop.title || '').toLowerCase();
    const pAddress = (prop.address || '').toLowerCase();
    const pDesc = (prop.description || '').toLowerCase();

    if (criteria.destination) {
      const destLower = criteria.destination.toLowerCase();
      if (pCity.includes(destLower) || destLower.includes(pCity)) {
        score += 50;
        isExactLocationMatch = true;
        matchReasons.push(`Located directly in ${prop.city}`);
      } else if (pTitle.includes(destLower) || pAddress.includes(destLower) || pDesc.includes(destLower)) {
        score += 40;
        isExactLocationMatch = true;
        matchReasons.push(`Located in ${prop.city} (${criteria.destination} area)`);
      } else if (criteria.state && pState.includes(criteria.state.toLowerCase())) {
        score += 20;
        matchReasons.push(`Authentic stay in ${prop.state}`);
      }
    } else if (criteria.state) {
      if (pState.includes(criteria.state.toLowerCase())) {
        score += 35;
        isExactLocationMatch = true;
        matchReasons.push(`Located in ${prop.state}`);
      }
    }

    // 2. Budget Match (Max 30 points)
    if (criteria.maxBudget) {
      if (startingPrice <= criteria.maxBudget) {
        score += 30;
        matchReasons.push(`Within budget from ₹${startingPrice}/night (Limit: ₹${criteria.maxBudget})`);
      } else if (startingPrice <= criteria.maxBudget + 400) {
        score += 10;
        isBudgetMatch = false;
        matchReasons.push(`Slightly above ₹${criteria.maxBudget} budget (Starts at ₹${startingPrice}/night)`);
      } else {
        score -= 20;
        isBudgetMatch = false;
      }
    } else {
      score += 10;
    }

    // 3. Guest Capacity Match (Max 25 points)
    const matchingRooms = criteria.guests 
      ? rooms.filter((r) => (r.maxGuests || 2) >= (criteria.guests || 1))
      : rooms;

    if (criteria.guests) {
      if (matchingRooms.length > 0) {
        score += 25;
        matchReasons.push(`Accommodates ${criteria.guests} guest${criteria.guests > 1 ? 's' : ''} comfortably`);
      } else if (maxCapacity >= criteria.guests) {
        score += 15;
        matchReasons.push(`Max capacity up to ${maxCapacity} guests`);
      } else {
        score -= 10;
        isGuestMatch = false;
      }
    }

    // 4. Property Type Match (Max 20 points)
    if (criteria.propertyType) {
      const crit = criteria.propertyType.toLowerCase();
      const ptype = (prop.propertyType || '').toLowerCase();
      if (
        ptype === crit ||
        (crit === 'pg / hostel' && (ptype.includes('pg') || ptype.includes('hostel'))) ||
        (crit === 'monthly room' && ptype.includes('monthly'))
      ) {
        score += 20;
        matchReasons.push(`Authentic ${prop.propertyType}`);
      }
    } else {
      score += 5;
    }

    // 5. Landmark / Nearby Attraction / Vibe Match (Max 20 points)
    let distanceNote: string | undefined = undefined;
    if (prop.nearbyAttractions && prop.nearbyAttractions.length > 0) {
      distanceNote = prop.nearbyAttractions[0];
    }

    if (criteria.nearAttraction) {
      const natLower = criteria.nearAttraction.toLowerCase();
      const matchedAttraction = (prop.nearbyAttractions || []).find((a) =>
        a.toLowerCase().includes(natLower)
      );
      if (matchedAttraction) {
        score += 20;
        distanceNote = matchedAttraction;
        matchReasons.push(`Very close to ${matchedAttraction}`);
      } else if (pDesc.includes(natLower) || pAddress.includes(natLower)) {
        score += 15;
        matchReasons.push(`Convenient access to ${criteria.nearAttraction}`);
      }
    }

    // Check specific trip vibes (Safari, Trek, Peaceful)
    if (criteria.tripType === 'safari' && (pTitle.includes('kaziranga') || pDesc.includes('safari') || pDesc.includes('rhino'))) {
      score += 20;
      matchReasons.push('Prime base for Kaziranga Safari & Elephant rides');
    }
    if (criteria.tripType === 'trekking' && (pTitle.includes('dzukou') || pDesc.includes('trek') || pTitle.includes('trail'))) {
      score += 20;
      matchReasons.push('Direct trailhead access for Dzukou Valley trekking');
    }
    if (criteria.tripType === 'peaceful' && (pDesc.includes('peaceful') || pDesc.includes('serene') || pTitle.includes('mist') || pTitle.includes('island'))) {
      score += 15;
      matchReasons.push('Peaceful scenic natural surroundings');
    }

    // 6. Direct User Query Keyword Mentions (Max 15 points)
    if (qLower) {
      if (qLower.includes('chang ghar') || qLower.includes('stilt') || qLower.includes('bamboo')) {
        if (pDesc.includes('chang ghar') || pDesc.includes('bamboo stilt') || pTitle.includes('bamboo') || pTitle.includes('stilt')) {
          score += 15;
          matchReasons.push('Traditional Assamese Chang Ghar (bamboo stilts) architecture');
        }
      }
      if (qLower.includes('view') || qLower.includes('mountain')) {
        if (pTitle.includes('view') || pDesc.includes('view') || pTitle.includes('mist')) {
          score += 10;
          matchReasons.push('Breathtaking mountain and valley views');
        }
      }
      if (qLower.includes('mishing') || qLower.includes('tribe') || qLower.includes('tribal')) {
        if (pDesc.includes('mishing') || pDesc.includes('tribal') || pTitle.includes('tribal') || pDesc.includes('naga') || pDesc.includes('monpa')) {
          score += 15;
          matchReasons.push('Authentic indigenous tribal culture & ethnic hospitality');
        }
      }
    }

    // 7. Trust & Verification Bonus (Max 15 points)
    if (prop.isVerified) {
      score += 10;
      matchReasons.push('THIKANA Blue Verified Host');
    }
    if (prop.isFeatured) {
      score += 5;
    }
    if (prop.rating && prop.rating >= 4.8) {
      score += 5;
    }

    // Generate concise summary reason
    const uniqueReasons = Array.from(new Set(matchReasons)).slice(0, 3);
    const matchReason = uniqueReasons.length > 0
      ? uniqueReasons.join(' • ')
      : `${prop.propertyType} in ${prop.city}, zero commission direct booking.`;

    return {
      property: prop,
      startingPrice,
      matchingRooms: matchingRooms.length > 0 ? matchingRooms : rooms,
      maxCapacity,
      amenities: amenitiesList.slice(0, 6),
      score,
      matchReason,
      distanceNote,
      isExactLocationMatch,
      isBudgetMatch,
      isGuestMatch,
    };
  });

  // Sort by score descending
  scoredMatches.sort((a, b) => b.score - a.score);

  // Check if we have exact destination/filter matches
  const exactLocationMatches = criteria.destination
    ? scoredMatches.filter((m) => m.isExactLocationMatch)
    : scoredMatches;

  let finalMatches: MitraPropertyMatch[] = [];
  let isExactMatch = true;

  if (criteria.destination && exactLocationMatches.length === 0) {
    isExactMatch = false;
    // Provide top 3 closest Northeast homestays
    finalMatches = scoredMatches.slice(0, 3);
  } else if (criteria.destination) {
    // If destination matches exist, return them (up to 4)
    finalMatches = exactLocationMatches.slice(0, 4);
    // Check if budget matched
    if (criteria.maxBudget && !finalMatches.some((m) => m.startingPrice <= (criteria.maxBudget || 99999))) {
      isExactMatch = false;
    }
  } else {
    // General search: return top scored (3 to 5)
    finalMatches = scoredMatches.slice(0, 4);
  }

  // Identify missing fields to ask user politely if query was bare
  const missingFields: string[] = [];
  if (!criteria.destination) missingFields.push('destination');
  if (!criteria.guests) missingFields.push('number of guests');
  if (!criteria.maxBudget) missingFields.push('approximate budget per night');

  // Suggested quick followup prompts
  const suggestedPrompts: string[] = [];
  if (criteria.destination === 'Kaziranga') {
    suggestedPrompts.push('Under ₹1500 in Kaziranga', 'Near Kohora Safari Gate', 'Chang Ghar bamboo stilt stay');
  } else if (criteria.destination === 'Cherrapunji') {
    suggestedPrompts.push('Homestay near Nohkalikai', 'Double Decker Living Root trek', 'Family cottage in Sohra');
  } else if (criteria.destination === 'Tawang') {
    suggestedPrompts.push('Tawang Monastery view', 'Cottage with Bukhari heater', 'Homestay with local Monpa food');
  } else if (criteria.destination === 'Majuli Island') {
    suggestedPrompts.push('Mishing bamboo stilt stay', 'Brahmaputra river sunset view', 'Near ancient Xatras');
  } else if (criteria.destination === 'Kohima') {
    suggestedPrompts.push('Dzukou Valley trek base', 'Naga homestay with bonfire', 'Near Kisama village');
  } else {
    suggestedPrompts.push('Kaziranga homestays', 'Sohra Cherrapunji stays', 'Under ₹1500', 'Family stays', 'Near safari gate', 'Mountain view');
  }

  // Generate fallback explanation string
  let explanation = '';
  if (isExactMatch && finalMatches.length > 0) {
    const top = finalMatches[0];
    explanation = `I found authentic verified options matching your request for ${criteria.destination || 'Northeast India'}${criteria.guests ? ` (${criteria.guests} guests)` : ''}${criteria.maxBudget ? ` under ₹${criteria.maxBudget}/night` : ''}. Top match: **${top.property.title}** (${top.matchReason}).`;
  } else if (!isExactMatch && criteria.destination) {
    explanation = `I could not find an exact match in ${criteria.destination} with those exact criteria right now. Here are the closest available options on THIKANA:`;
  } else {
    explanation = `Here are our top rated authentic Northeast homestays and eco lodges available for direct WhatsApp booking:`;
  }

  return {
    criteria,
    matches: finalMatches,
    isExactMatch,
    explanation,
    missingFields,
    suggestedPrompts: suggestedPrompts.slice(0, 4),
  };
}

/**
 * Format a ready-to-send WhatsApp booking message for the chosen property
 */
export function createWhatsAppBookingMessage(
  property: Property,
  criteria: MitraSearchCriteria = {},
  room?: RoomType
): string {
  const guestCount = criteria.guests || 2;
  const roomName = room ? room.roomName : (property.propertyType === 'Homestay' ? 'Homestay Room' : 'Standard Room');
  const price = room ? (room.discountPrice || room.pricePerNight) : 1500;
  
  let dateText = '';
  if (criteria.checkIn && criteria.checkOut) {
    dateText = `from ${criteria.checkIn} to ${criteria.checkOut}`;
  } else if (criteria.checkIn) {
    dateText = `from ${criteria.checkIn}`;
  } else {
    dateText = 'for my upcoming trip';
  }

  return `Hello ${property.ownerName || 'Host'}, I found your property *${property.title}* on THIKANA.

I would like to enquire about a room (${roomName}) for *${guestCount} guest${guestCount > 1 ? 's' : ''}* ${dateText}.

Please confirm room availability and price (listed at ~₹${price}/night). We look forward to connecting directly with zero middleman fee. Thank you!`;
}
