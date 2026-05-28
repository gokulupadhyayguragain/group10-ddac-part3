import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Person, Sighting } from '../lib/types';

type MapPoint = {
  id: string;
  title: string;
  subtitle: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

function fallbackPosition(seedText: string) {
  const seed = Array.from(seedText).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const lat = 27.7 + ((seed % 15) - 7) * 0.008;
  const lon = 85.32 + (((seed >> 2) % 15) - 7) * 0.008;
  return [lat, lon] as const;
}

function toPoint(item: MapPoint) {
  const lat = Number(item.latitude);
  const lon = Number(item.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon] as const;
  return fallbackPosition(`${item.id}:${item.title}`);
}

export default function Map({ persons = [], sightings = [] }: { persons?: Person[]; sightings?: Sighting[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: false }).setView([27.7, 85.32], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    const icon = L.divIcon({
      className: 'trace-marker',
      html: '<span></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const points: MapPoint[] = [
      ...persons.map((person) => ({
        id: `person-${person.id}`,
        title: person.full_name,
        subtitle: person.last_seen_location || 'Last seen location unknown',
        latitude: person.latitude,
        longitude: person.longitude,
      })),
      ...sightings.map((sighting) => ({
        id: `sighting-${sighting.id}`,
        title: sighting.person_name ? `${sighting.person_name} sighting` : `Sighting #${sighting.id}`,
        subtitle: sighting.location,
        latitude: sighting.latitude,
        longitude: sighting.longitude,
      })),
    ];

    points.forEach((point) => {
      const [lat, lon] = toPoint(point);
      const content = document.createElement('div');
      const title = document.createElement('strong');
      const subtitle = document.createElement('div');
      title.textContent = point.title;
      subtitle.textContent = point.subtitle;
      content.append(title, subtitle);
      L.marker([lat, lon], { icon }).addTo(map).bindPopup(content);
    });

    return () => {
      map.remove();
    };
  }, [persons, sightings]);

  return <div ref={ref} className="h-[420px] w-full rounded-xl border border-slate-200" />;
}
