import { TRUCK_PROFILE } from "./constants";
import type { AgentResponse, Category, LatLng, PlacesResponse, Place, RouteInfo } from "./types";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  places: (category: Category, at: LatLng) =>
    request<PlacesResponse>(`/places?category=${category}&lat=${at.lat}&lng=${at.lng}`),
  route: (from: LatLng, placeId: string) =>
    request<{ place: Place; route: RouteInfo }>(`/route`, {
      method: "POST",
      body: JSON.stringify({ lat: from.lat, lng: from.lng, place_id: placeId }),
    }),
  agent: (text: string, at: LatLng) =>
    request<AgentResponse>(`/agent`, {
      method: "POST",
      body: JSON.stringify({ text, lat: at.lat, lng: at.lng, truck_profile: TRUCK_PROFILE }),
    }),
};
