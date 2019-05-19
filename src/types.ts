import { StrMap } from 'fp-ts/es6/StrMap';

export interface Vehicle {
  gtfsId: string;
  coordinates: [number, number];
  speed: number;
  acceleration: number;
  heading: number;
  lastUpdate: number;
  lastPing: number;
  destination: string;
  active: boolean;
}

export type Vehicles = StrMap<Vehicle>;

export interface Route {
  gtfsId: string;
  shortName: string;
}
