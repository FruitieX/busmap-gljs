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
  source: mapboxgl.GeoJSONSource;
}

type Markers = StrMap<Marker>;

const getVehicleGeoJSONData = (
  vehicleId: string,
  vehicle: Vehicle,
): GeoJSON.Feature<Point> => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: vehicle.coordinates,
  },
  properties: {
    title: vehicleId,
    icon: 'bus',
  },
});

const createMarkers = (vehicles: Vehicles) => (mapbox: mapboxgl.Map): Markers =>
  vehicles.mapWithKey((vehicleId, vehicle) => {
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
        'text-field': '{title}',
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-offset': [0, 0.6],
        'text-anchor': 'top',
        'text-allow-overlap': true,
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

    if (source.type !== 'geojson') throw new Error('blabla');

    return { source };
  });

const removeMarkers = (vehicles: Vehicles) => (mapbox: mapboxgl.Map) =>
  vehicles.map(vehicle => mapbox.removeLayer(vehicle.gtfsId));

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

    marker.map(m =>
      m.source.setData(getVehicleGeoJSONData(vehicleId, vehicle)),
    );
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
