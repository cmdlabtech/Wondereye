export interface LandmarkRequest {
  lat: number;
  lng: number;
  radius?: number;
}

export interface RawPOI {
  name: string;
  type: string;
  lat: number;
  lng: number;
  distance: number;
  wikipedia?: string;
  wikidata?: string;
  description?: string;
  startDate?: string;
  architect?: string;
  city?: string;
}

export interface Landmark {
  name: string;
  type: string;
  distance: number;
  lat: number;
  lng: number;
  snippet: string;
  wikipedia?: string;
  wikidata?: string;
  description?: string;
  startDate?: string;
  architect?: string;
  city?: string;
}

export interface LandmarkDetailInput {
  name: string;
  type?: string;
  lat?: number;
  lng?: number;
  distance?: number;
  snippet?: string;
  wikipedia?: string;
  wikidata?: string;
  description?: string;
  startDate?: string;
  architect?: string;
  city?: string;
  units: 'imperial' | 'metric';
}

export interface LandmarkResponse {
  landmarks: Landmark[];
}

export type Bindings = {
  XAI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  LANDMARKS_CACHE: KVNamespace;
  DEV?: string;
};
