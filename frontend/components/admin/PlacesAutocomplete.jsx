'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Google Places Autocomplete input.
 *
 * Loads the Maps JS API (Places library) once using the public, referrer-
 * restricted browser key in NEXT_PUBLIC_GOOGLE_MAPS_KEY. On selection it calls
 * onSelect({ address, lat, lng }). If the key is missing it degrades to a plain
 * text input so the form still works (the backend can geocode the text).
 */

let loaderPromise = null;
function loadMaps(key) {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export default function PlacesAutocomplete({ label, value, onChange, onSelect, placeholder }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const [ready, setReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  useEffect(() => {
    if (!key) return; // no key → plain input
    let cancelled = false;
    loadMaps(key)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry'],
      componentRestrictions: { country: ['ke', 'ug', 'tz', 'rw'] }, // East Africa
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      const sel = {
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      onChange?.(sel.address);
      onSelect?.(sel);
    });
    acRef.current = ac;
  }, [ready, onChange, onSelect]);

  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder || (key ? 'Start typing an address…' : 'Type an address')}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40"
      />
      {!key && (
        <p className="text-[10px] text-gray-400 mt-1">
          Autocomplete off — set NEXT_PUBLIC_GOOGLE_MAPS_KEY. The server will geocode the typed address.
        </p>
      )}
    </div>
  );
}
