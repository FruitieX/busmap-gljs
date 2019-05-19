import React, { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { Option } from 'fp-ts/es6/Option';
import { MqttClient } from 'mqtt';
import { Route, Vehicle } from './types';
import { lookup } from 'fp-ts/es6/StrMap';

import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import ReactMapGL, {
  ViewState,
  GeolocateControl,
  ViewStateChangeInfo,
} from 'react-map-gl';
import { RealtimeDataState } from './App';

// these are 100% made up
const metersToLatitude = (m: number) => (m / 40000) * 1.3;
const metersToLongitude = (m: number) => (m / 20000) * 1.3;

const getVehicleUpdateDelta = (lastUpdate: number) =>
  (new Date().getTime() - lastUpdate) / 1000;

const calcVehicleCoordinates = (vehicle: Vehicle) => {
  const delta = getVehicleUpdateDelta(vehicle.lastUpdate);
  const speed = Math.max(
    0,
    vehicle.speed,
    // (vehicle.speed + vehicle.speed * vehicle.acceleration * delta) *
    //   Math.max(0, 1 - delta * 0.5),
  );

  const diffX = metersToLongitude(speed * Math.sin(vehicle.heading)) * delta;
  const diffY = metersToLatitude(speed * Math.cos(vehicle.heading)) * delta;
  return [vehicle.coordinates[0] + diffX, vehicle.coordinates[1] + diffY];
};

const useAnimationFrame = (callback: (timestamp: number) => void) => {
  useEffect(() => {
    let animationFrame: number;

    const onFrame = (timestamp: number) => {
      callback(timestamp);

      animationFrame = requestAnimationFrame(onFrame);
    };

    animationFrame = requestAnimationFrame(onFrame);

    return () => cancelAnimationFrame(animationFrame);
  });
};

const fallbackCoordinates = [0, 0];
interface VehicleMapData {
  coordinates: [number, number];
  delta: number;
  destination: string;
  route: string;
  active: boolean;
}
const animateMarkers = (vehicleData: RealtimeDataState) => (
  deckGlRef: React.RefObject<DeckGL>,
) => {
  if (deckGlRef.current) {
    const data = vehicleData.iterationOrder.map(
      vehicleId =>
        lookup(vehicleId, vehicleData.vehicles)
          .map(vehicle => ({
            coordinates: vehicle.active
              ? calcVehicleCoordinates(vehicle)
              : fallbackCoordinates,
            delta: getVehicleUpdateDelta(vehicle.lastPing),
            destination: vehicle.destination,
            route: vehicle.gtfsId,
            active: vehicle.active,
          }))
          .toNullable()!,
    );

    // @ts-ignore
    deckGlRef.current.deck.setProps({
      layers: [
        new ScatterplotLayer({
          id: 'vehicle-pings',
          data,
          dataComparator: () => false,
          getPosition: (vehicle: VehicleMapData) => [
            vehicle.coordinates[0],
            vehicle.coordinates[1],
            vehicle.delta,
          ],
          getRadius: (vehicle: VehicleMapData) =>
            Math.min((0.25 + vehicle.delta * 0.75 * 0.5) * 16, 16),
          getFillColor: (vehicle: VehicleMapData) => [
            0,
            124,
            191,
            Math.max(1 - vehicle.delta * 0.5, 0) * 255,
          ],
        } as any),
        // new IconLayer({
        //   id: 'vehicle-icons',
        //   data,
        //   pickable: true,
        //   sizeScale: 15,
        // })
        new TextLayer({
          id: 'vehicle-names',
          data,
          getPosition: (vehicle: VehicleMapData) => [
            vehicle.coordinates[0] + 0.0002,
            vehicle.coordinates[1],
            10,
          ],
          getText: (vehicle: VehicleMapData) => `${vehicle.route}`, // (${vehicle.destination})`,
          getSize: 50,
          sizeMinPixels: 12,
          sizeMaxPixels: 26,
          sizeUnits: 'meters',
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
        } as any),
      ],
    });
  }
};

interface MapProps {
  rtApi: Option<MqttClient>;
  routes: Route[];
  vehicleData: React.MutableRefObject<RealtimeDataState>;
}

const initialViewState = {
  // Helsinki city centre
  longitude: 24.95,
  latitude: 60.17,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

const positionOptions = { enableHighAccuracy: true };

const geolocateStyle = {
  style: {
    position: 'absolute',
    top: 0,
    right: 0,
    margin: 10,
  },
};

export const MapComponent: React.FunctionComponent<MapProps> = ({
  vehicleData,
}) => {
  const deckGlRef = React.useRef<DeckGL>(null);

  useAnimationFrame(() => {
    animateMarkers(vehicleData.current)(deckGlRef);
  });

  const [viewport, setViewport] = React.useState(initialViewState);
  const onViewStateChange = React.useCallback(
    (viewport: ViewStateChangeInfo) => {
      setViewport(viewport as any);
    },
    [setViewport],
  );

  return (
    <DeckGL
      ref={deckGlRef}
      controller={true}
      initialViewState={initialViewState}
      {...viewport}
    >
      <ReactMapGL
        mapStyle={`https://api.maptiler.com/maps/basic/style.json?key=${
          process.env.REACT_APP_MAPTILER_KEY
        }`}
        width="100%"
        height="100%"
        {...viewport}
        // Roughly corresponds to Greater Helsinki area
        // maxBounds={[[24, 59.8], [26, 60.5]]}
        // minZoom={10}
        reuseMaps
        preventStyleDiffing={false}
      >
        {/* <GeolocateControl
          showUserLocation={true}
          trackUserLocation={true}
          positionOptions={positionOptions}
          onViewStateChange={onViewStateChange}
          {...geolocateStyle}
        /> */}
      </ReactMapGL>
    </DeckGL>
  );
};
