import React from 'react';
import { Property } from '../types';
import { MapPin, Navigation, ExternalLink, Compass } from 'lucide-react';

interface MapLocationViewProps {
  property: Property;
}

export const MapLocationView: React.FC<MapLocationViewProps> = ({ property }) => {
  const hasCoordinates = typeof property.latitude === 'number' && Number.isFinite(property.latitude) && typeof property.longitude === 'number' && Number.isFinite(property.longitude);
  const locationQuery = [property.address, property.city, property.state].filter(Boolean).join(', ');
  const googleMapSearchUrl = property.googleMapUrl || (hasCoordinates
    ? `https://maps.google.com/?q=${property.latitude},${property.longitude}`
    : `https://maps.google.com/?q=${encodeURIComponent(locationQuery)}`);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-base">
          <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>Location & Map</span>
        </div>

        <a
          href={googleMapSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
        >
          <span>Open Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
        {property.address}, {property.city}, {property.state}
      </p>

      {/* Embedded Map Representation */}
      <div className="relative rounded-2xl overflow-hidden h-48 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-4 text-center group">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] opacity-20 dark:opacity-30" />
        
        <div className="relative z-10 space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg group-hover:scale-110 transition-transform">
            <Navigation className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="font-extrabold text-sm text-slate-900 dark:text-white">
              {hasCoordinates ? `Lat: ${property.latitude} • Lng: ${property.longitude}` : 'Exact map coordinates not provided'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hasCoordinates ? 'Map coordinates supplied for this property' : 'Directions open using the host-entered address'}
            </p>
          </div>

          <a
            href={googleMapSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-extrabold px-4 py-2 rounded-xl shadow-md hover:opacity-90 transition-all cursor-pointer"
          >
            <span>Get Directions</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Nearby Attractions */}
      {property.nearbyAttractions && property.nearbyAttractions.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Nearby Attractions & Distance:</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {property.nearbyAttractions.map((attraction, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-medium border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{attraction}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
