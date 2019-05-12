import { StrMap } from 'fp-ts/es6/StrMap';

export interface Vehicle {
  gtfsId: string;
  coordinates: [number, number];
  lastUpdate: number;
}

export type Vehicles = StrMap<Vehicle>;

export interface Route {
  gtfsId: string;
  shortName: string;
}
