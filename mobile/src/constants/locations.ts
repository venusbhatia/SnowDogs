import type { LngLat } from '../types';

export type CityOption = {
  label: string;
  value: string;
  coords: LngLat;
};

export type RoutePreset = {
  id: string;
  label: string;
  note: string;
  originValue: string;
  destinationValue: string;
  recommended?: boolean;
};

export const CITIES: CityOption[] = [
  { label: 'Thunder Bay', value: 'thunder_bay', coords: [-89.2477, 48.3809] },
  { label: 'Toronto', value: 'toronto', coords: [-79.3832, 43.6532] },
  { label: 'Sudbury', value: 'sudbury', coords: [-81.0, 46.49] },
  { label: 'Sault Ste Marie', value: 'sault_ste_marie', coords: [-84.33, 46.52] },
  { label: 'Barrie', value: 'barrie', coords: [-79.69, 44.39] },
  { label: 'Parry Sound', value: 'parry_sound', coords: [-80.0331, 45.3479] },
  { label: 'North Bay', value: 'north_bay', coords: [-79.4608, 46.3091] },
  { label: 'Kingston', value: 'kingston', coords: [-76.486, 44.2312] },
  { label: 'Ottawa', value: 'ottawa', coords: [-75.6972, 45.4215] },
  { label: 'London', value: 'london', coords: [-81.2453, 42.9849] }
];

export const ROUTE_PRESETS: RoutePreset[] = [
  {
    id: 'judge_friendly',
    label: 'Barrie to Sudbury',
    note: 'Balanced checkpoint count for the cleanest demo run.',
    originValue: 'barrie',
    destinationValue: 'sudbury',
    recommended: true
  },
  {
    id: 'snowbelt',
    label: 'Toronto to Barrie',
    note: 'Fastest scan if you need a shorter corridor.',
    originValue: 'toronto',
    destinationValue: 'barrie'
  },
  {
    id: 'northern_corridor',
    label: 'Sudbury to Sault Ste Marie',
    note: 'Northern route with enough distance for several hazard checks.',
    originValue: 'sudbury',
    destinationValue: 'sault_ste_marie'
  },
  {
    id: 'shield_hop',
    label: 'Parry Sound to Sudbury',
    note: 'Compact northern shield run with a solid checkpoint spread.',
    originValue: 'parry_sound',
    destinationValue: 'sudbury'
  },
  {
    id: 'north_connector',
    label: 'North Bay to Sudbury',
    note: 'Good mid-length corridor when you want a faster scan than the full northbound routes.',
    originValue: 'north_bay',
    destinationValue: 'sudbury'
  },
  {
    id: 'east_corridor',
    label: 'Toronto to Kingston',
    note: 'Highway 401 eastbound corridor with enough length for route enrichment.',
    originValue: 'toronto',
    destinationValue: 'kingston'
  },
  {
    id: 'capital_run',
    label: 'Kingston to Ottawa',
    note: 'Clean eastern Ontario route for a shorter checkpoint demo.',
    originValue: 'kingston',
    destinationValue: 'ottawa'
  },
  {
    id: 'algonquin_arc',
    label: 'Ottawa to North Bay',
    note: 'Long inland connector with more time slices for weather and road checks.',
    originValue: 'ottawa',
    destinationValue: 'north_bay'
  },
  {
    id: 'southern_fallback',
    label: 'London to Toronto',
    note: 'Southern Ontario fallback route when you need a denser highway corridor.',
    originValue: 'london',
    destinationValue: 'toronto'
  },
  {
    id: 'full_northbound',
    label: 'Barrie to Sault Ste Marie',
    note: 'Extended northern corridor for the biggest end-to-end route demo.',
    originValue: 'barrie',
    destinationValue: 'sault_ste_marie'
  }
];

export function getCityByValue(value: string): CityOption | undefined {
  return CITIES.find((city) => city.value === value);
}

export function tomorrowAtSix(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(6, 0, 0, 0);
  return date;
}
