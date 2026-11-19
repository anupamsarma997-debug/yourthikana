import React, { useState } from 'react';
import { Property } from '../types';
import { X, Play, Image as ImageIcon, ChevronLeft, ChevronRight, Video } from 'lucide-react';

interface PropertyGalleryModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PropertyGalleryModal: React.FC<PropertyGalleryModalProps> = ({
  property,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'photos' | 'video'>('photos');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const photos = property?.photos || [];

  const handleNext = () => {
    setActivePhotoIdx((prev) => (prev + 1) % photos.length);
  };

  const handlePrev = () => {
    setActivePhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
  };

  if (!isOpen || !property) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-6 text-white shadow-2xl border border-slate-800 relative flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-black text-white">{property.title}</h3>
            <p className="text-xs text-slate-400">{property.city}, {property.state}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Tabs */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('photos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTab === 'photos' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Photos ({photos.length})</span>
              </button>

              {property.videoUrl && (
                <button
                  onClick={() => setActiveTab('video')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    activeTab === 'video' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>10s Video</span>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media Viewer Area */}
        <div className="flex-1 my-4 min-h-[350px] relative flex items-center justify-center bg-slate-950 rounded-2xl overflow-hidden">
          {activeTab === 'photos' ? (
            <div className="relative w-full h-full flex items-center justify-center group">
              <img
                src={photos[activePhotoIdx] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'}
                alt={`Property Photo ${activePhotoIdx + 1}`}
                className="max-h-[500px] w-auto max-w-full object-contain rounded-xl shadow-lg"
              />

              {/* Prev / Next Controls */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={handlePrev}
                    className="absolute left-4 p-3 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white transition-all shadow-xl"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={handleNext}
                    className="absolute right-4 p-3 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white transition-all shadow-xl"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Index Indicator */}
              <div className="absolute bottom-4 bg-slate-900/80 px-3 py-1 rounded-full text-xs font-bold text-slate-300 border border-slate-700">
                {activePhotoIdx + 1} / {photos.length}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-2">
              <video
                src={property.videoUrl}
                controls
                autoPlay
                loop
                className="max-h-[480px] w-full rounded-2xl shadow-xl"
              />
            </div>
          )}
        </div>

        {/* Thumbnail Carousel Strip */}
        {activeTab === 'photos' && photos.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {photos.map((photo, idx) => (
              <button
                key={idx}
                onClick={() => setActivePhotoIdx(idx)}
                className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                  activePhotoIdx === idx ? 'border-emerald-500 scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={photo} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};
