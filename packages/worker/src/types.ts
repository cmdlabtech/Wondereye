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
}

export interface Landmark {
  name: string;
  type: string;
  distance: number;
  snippet: string;
}

export interface LandmarkResponse {
  landmarks: Landmark[];
}

export type Bindings = {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN?: string;
};
