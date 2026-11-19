"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapUnit {
  id: string;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  state: "arrived" | "late" | "delay" | "relocated" | "idle";
}

const COLORS: Record<MapUnit["state"], string> = { arrived: "#0a7a3d", late: "#b42318", delay: "#a8670f", relocated: "#4a2c7a", idle: "#56665d" };
const STYLE = "https://tiles.openfreemap.org/styles/positron"; // open tiles, no API key

/** Live map of demo polling units in Surulere. Markers are coloured by the latest official check-in. */
export function PuMap({ units }: { units: MapUnit[] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !el.current || mapRef.current) return;
      try {
        // Serve the worker ourselves: bundlers break MapLibre's default worker loading.
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const map = new maplibre.Map({ container: el.current, style: STYLE, center: [3.356, 6.497], zoom: 12.2, attributionControl: { compact: true }, cooperativeGestures: true });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", () => setFailed(true));
        map.once("load", () => {
          if (!reduce) map.easeTo({ zoom: 13.4, duration: 1200, easing: (t: number) => 1 - Math.pow(1 - t, 4) });
        });
        mapRef.current = map;
        setReady(true);
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      const map = mapRef.current;
      if (cancelled || !map || !ready) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = units
        .filter((u) => u.lat != null && u.lng != null)
        .map((u) => {
          const dot = document.createElement("button");
          dot.type = "button";
          dot.setAttribute("aria-label", `${u.name}: ${u.state}`);
          dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:${COLORS[u.state]};border:3px solid #f6f7f2;box-shadow:0 0 0 1px rgba(15,31,23,.35);cursor:pointer`;
          const popup = new maplibre.Popup({ offset: 12, closeButton: false }).setHTML(
            `<strong style="font-family:var(--font-barlow-condensed);font-size:16px;text-transform:uppercase">${u.name.replace(/</g, "&lt;")}</strong><br/><span style="font-family:var(--font-plex-mono);font-size:12px">${u.code}</span>`,
          );
          return new maplibre.Marker({ element: dot }).setLngLat([u.lng!, u.lat!]).setPopup(popup).addTo(map);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [units, ready]);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-[10px] border border-line bg-surface-2 lg:h-[440px]">
      <div ref={el} className="h-full w-full" />
      {failed && <p className="absolute inset-x-0 top-0 bg-surface/90 px-4 py-2 text-sm text-muted">Map tiles couldn&apos;t load. The table below has every polling unit.</p>}
      <ul className="absolute left-3 top-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-x-3 gap-y-1 rounded-[6px] bg-surface/95 px-3 py-2 text-xs font-medium shadow-sm">
        {(["arrived", "delay", "late", "relocated", "idle"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[s] }} />
            {{ arrived: "Officials in", delay: "Delayed", late: "Late, no check-in", relocated: "Relocated", idle: "No update" }[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}
