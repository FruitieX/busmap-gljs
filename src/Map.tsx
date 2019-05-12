import React, { useEffect, useState, useLayoutEffect } from 'react';
import styled from 'styled-components';
import mapboxgl, { GeoJSONSource, GeoJSONSourceRaw } from 'mapbox-gl';
import { none, some, Option } from 'fp-ts/es6/Option';
import { MqttClient } from 'mqtt';
import { Route, Vehicles, Vehicle } from './types';
import { StrMap, lookup } from 'fp-ts/es6/StrMap';
import { Point } from 'geojson';

const useMap = () => {
  const [mapState, setMap] = useState<Option<mapboxgl.Map>>(none);

  // Map initialization effect
  useLayoutEffect(() => {
    mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: 'mapbox-root',
      style: 'mapbox://styles/mapbox/streets-v11',

      // Helsinki city centre
      center: [24.95, 60.17],
      zoom: 12,

      // Roughly corresponds to Greater Helsinki area
      maxBounds: [[24, 59.8], [26, 60.5]],
      minZoom: 10,
    });

    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });

    map.addControl(geolocateControl);

    map.on('load', () => {
      // Immediately try triggering geolocation
      geolocateControl.trigger();

      // Only hand over access to map after it has loaded
      setMap(some(map));
    });

    return () => map.remove();
  }, []);

  // TODO: replace with 'as const' once CRA updates to recent enough Babel version
  return [mapState, setMap] as [typeof mapState, typeof setMap];
};

interface Marker {
  update: (vehicle: Vehicle) => void;
}

type Markers = StrMap<Marker>;

// these are 100% made up
const metersToLatitude = (m: number) => (m / 40000) * 1.3;
const metersToLongitude = (m: number) => (m / 20000) * 1.3;

const calcVehicleCoordinates = (vehicle: Vehicle, delta = 0) => {
  const v = Math.max(0, vehicle.speed + (vehicle.acceleration / 2) * delta);

  const diffX = metersToLongitude(v * Math.sin(vehicle.heading)) * delta;
  const diffY = metersToLatitude(v * Math.cos(vehicle.heading)) * delta;
  return [vehicle.coordinates[0] + diffX, vehicle.coordinates[1] + diffY];
};

const getVehicleGeoJSONData = (
  vehicleId: string,
  vehicle: Vehicle,
  delta?: number,
): GeoJSON.Feature<Point> => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: calcVehicleCoordinates(vehicle, delta),
  },
  properties: {
    title: vehicleId,
    icon: 'bus',
  },
});

const getPingGeoJSONData = (
  vehicle: Vehicle,
  delta?: number,
): GeoJSON.Point => ({
  type: 'Point',
  coordinates: calcVehicleCoordinates(vehicle, delta),
});

const getPingId = (vehicleId: string) => `${vehicleId}-ping`;

const createMarkers = (vehicles: Vehicles) => (mapbox: mapboxgl.Map) =>
  vehicles.mapWithKey((vehicleId, vehicle) => {
    console.log(`Adding layer for vehicleId: ${vehicleId}`);

    mapbox.addLayer({
      id: getPingId(vehicleId),
      type: 'circle',
      source: {
        type: 'geojson',
        data: getPingGeoJSONData(vehicle),
      } as any,
      paint: {
        'circle-radius': 0,
        'circle-opacity': 1,
        'circle-radius-transition': { duration: 0 },
        'circle-opacity-transition': { duration: 0 },
        'circle-color': '#007cbf',
      },
    });

    mapbox.addLayer({
      id: vehicleId,
      type: 'symbol',
      source: {
        type: 'geojson',
        data: getVehicleGeoJSONData(vehicleId, vehicle),
      },
      layout: {
        'icon-image': '{icon}',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': '{title}',
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-offset': [0, 0.6],
        'text-anchor': 'top',
        'text-allow-overlap': true,
        'text-optional': true,
      },
      paint: {
        'icon-color': '#202',
        'text-color': '#202',
        'text-halo-color': '#fff',
        'text-halo-width': 2,
      },
    });

    mapbox.on('mouseenter', vehicleId, () => {
      mapbox.getCanvas().style.cursor = 'pointer';
    });

    mapbox.on('mouseleave', vehicleId, () => {
      mapbox.getCanvas().style.cursor = '';
    });

    const source = mapbox.getSource(vehicleId);
    const pingSource = mapbox.getSource(getPingId(vehicleId));

    if (source.type !== 'geojson') throw new Error('blabla');
    if (pingSource.type !== 'geojson') throw new Error('blabla');

    let renderedCoordinates = vehicle.coordinates;

    const update = (vehicle: Vehicle) => {
      const d = (new Date().getTime() - vehicle.lastUpdate) / 1000;
      if (
        renderedCoordinates[0] !== vehicle.coordinates[0] ||
        renderedCoordinates[1] !== vehicle.coordinates[1]
      ) {
        source.setData(getVehicleGeoJSONData(vehicleId, vehicle, d));
        pingSource.setData(getPingGeoJSONData(vehicle, d) as any);
        renderedCoordinates = vehicle.coordinates;
      }

      // mapbox.setPaintProperty(
      //   getPingId(vehicleId),
      //   'circle-radius',
      //   Math.min((0.25 + d * 0.75) * 16, 16),
      // );
      // mapbox.setPaintProperty(
      //   getPingId(vehicleId),
      //   'circle-opacity',
      //   Math.max(1 - d, 0),
      // );
    };

    return { update };
  });

const removeMarkers = (vehicles: Vehicles) => (mapbox: mapboxgl.Map) =>
  vehicles.mapWithKey(vehicleId => {
    console.log(`Removing layer for vehicleId: ${vehicleId}`);
    mapbox.removeLayer(vehicleId);
    mapbox.removeSource(vehicleId);

    mapbox.removeLayer(getPingId(vehicleId));
    mapbox.removeSource(getPingId(vehicleId));
  });

const useMarkers = (vehicles: Vehicles) => (mapState: Option<mapboxgl.Map>) => {
  const [markersState, setMarkers] = useState<Markers>(new StrMap({}));

  useEffect(() => {
    // Create markers for given vehicles, add them to map
    const markers = mapState.map(createMarkers(vehicles));
    markers.map(setMarkers);

    // Remove markers from map on effect cleanup
    return () => {
      mapState.map(removeMarkers(vehicles));
    };
  }, [vehicles, mapState]);

  return [markersState, setMarkers] as [typeof markersState, typeof setMarkers];
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

const animateMarkers = (vehicles: Vehicles) => (markers: Markers) =>
  vehicles.mapWithKey((vehicleId, vehicle) => {
    const marker = lookup(vehicleId, markers);
    marker.map(marker => marker.update(vehicle));
  });

const MapContainer = styled.main``;

interface MapProps {
  rtApi: Option<MqttClient>;
  routes: Route[];
  vehicles: React.MutableRefObject<Vehicles>;
}

export const Map: React.FunctionComponent<MapProps> = ({ vehicles }) => {
  const [mapState] = useMap();

  const [markers] = useMarkers(vehicles.current)(mapState);

  useAnimationFrame(() => {
    animateMarkers(vehicles.current)(markers);
  });

  return <MapContainer id="mapbox-root" />;
};
