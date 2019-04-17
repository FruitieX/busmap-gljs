import React, { useEffect, useState, useLayoutEffect } from 'react';
import styled from 'styled-components';
import mapboxgl from 'mapbox-gl';
import { none, some, Option } from 'fp-ts/es6/Option';
import { range } from 'fp-ts/es6/Array';

const useMap = () => {
  const [mapState, setMap] = useState<Option<mapboxgl.Map>>(none);

  // Map initialization effect
  useLayoutEffect(() => {
    mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: 'mapbox-root',
      style: 'mapbox://styles/mapbox/streets-v9',
      center: [24.95, 60.17],
      zoom: 12,
      minZoom: 10,
      maxBounds: [[24, 59.8], [26, 60.5]],
    });

    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
    );

    setMap(some(map));

    return () => map.remove();
  }, []);

  // TODO: replace with 'as const' once CRA updates to recent enough Babel version
  return [mapState, setMap] as [typeof mapState, typeof setMap];
};

const createMarkers = (count: number) =>
  range(1, count).map((value, index) =>
    // Set initial coords, otherwise mapbox explodes
    new mapboxgl.Marker().setLngLat([0, 0]),
  );

const useMarkers = (mapState: Option<mapboxgl.Map>) => {
  const [markersState, setMarkers] = useState<Option<mapboxgl.Marker[]>>(none);

  const markerCount = 5;
  useEffect(() => {
    const markers = createMarkers(markerCount);

    // Add each marker to the map
    mapState.map(map => markers.forEach(marker => marker.addTo(map)));

    setMarkers(some(markers));

    // Remove markers from map on effect cleanup
    return () => markers.forEach(marker => marker.remove());
  }, [markerCount, mapState]);

  return [markersState, setMarkers] as [typeof markersState, typeof setMarkers];
};

const useAnimation = (callback: (timestamp: number) => void) => {
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

const animateMarkers = (map: mapboxgl.Map) => (markers: mapboxgl.Marker[]) =>
  markers.forEach((marker, index) => {
    const timestamp = new Date().getTime() / 1000 + index;

    marker.setLngLat([
      Math.cos(timestamp) * 0.01 + 24.95,
      Math.sin(timestamp) * 0.01 + 60.17,
    ]);
  });

const MapContainer = styled.main``;

export const Map: React.FunctionComponent = () => {
  const [mapState, setMap] = useMap();
  const [markersState, setMarkers] = useMarkers(mapState);

  useAnimation(() => markersState.ap(mapState.map(animateMarkers)));

  return <MapContainer id="mapbox-root" />;
};
