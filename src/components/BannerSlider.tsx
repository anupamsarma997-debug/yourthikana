import React from 'react';
import { BannerAd } from '../types';
import { store } from '../services/store';
import { Megaphone, ExternalLink, Sparkles } from 'lucide-react';

interface BannerSliderProps {
  position: 'home' | 'search' | 'property';
  onOwnerClick?: () => void;
}

export const BannerSlider: React.FC<BannerSliderProps> = ({ position, onOwnerClick }) => {
  const [banners, setBanners] = React.useState<BannerAd[]>(store.getBanners(position));

  React.useEffect(() => {
    return store.subscribe(() => {
      setBanners(store.getBanners(position));
    });
  }, [position]);

  if (!banners || banners.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 p-4 text-white shadow-md sm:p-6 my-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <span className="bg-emerald-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider">Advertise on YourThikana</span>
            <h4 className="font-extrabold text-base sm:text-lg text-white mt-1">Promote your travel-related business</h4>
            <p className="text-xs text-slate-300">Ask about available banner placements, campaign duration and pricing. Ads are published only after terms and payment are confirmed.</p>
          </div>
        </div>
        <a href="https://wa.me/919101280465?text=Hello%20YourThikana%2C%20I%20want%20to%20advertise.%20Please%20share%20available%20placements%2C%20campaign%20duration%20and%20pricing." target="_blank" rel="noreferrer" className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5">
          <span>Enquire for Ads</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="my-4 space-y-3">
      {banners.map((b) => (
        <div
          key={b.id}
          className="relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg border border-slate-700/50 group"
        >
          {/* Background image preview */}
          <div className="absolute inset-0 z-0">
            <img
              src={b.imageUrl}
              alt={b.title ? `Promotional image: ${b.title}` : 'YourThikana partner banner'}
              width={1200}
              height={600}
              decoding="async"
              loading="lazy"
              className="w-full h-full object-cover opacity-35 group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-transparent" />
          </div>

          <div className="relative z-10 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Sponsored Ad
                </span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  THIKANA Partner
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                {b.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-200 mt-1">
                {b.subtitle}
              </p>
            </div>

            <a
              href={b.targetUrl.startsWith('#') ? '#' : b.targetUrl}
              onClick={(e) => {
                if (b.targetUrl.startsWith('#') && onOwnerClick) {
                  e.preventDefault();
                  onOwnerClick();
                }
              }}
              className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{b.ctaText || 'Learn More'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};
