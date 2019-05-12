import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { none, some, Option, fromNullable, option } from 'fp-ts/es6/Option';
import { connect, MqttClient } from 'mqtt';

import { Header } from './Header';
import { Map } from './Map';
import { last, difference, array, mapOption, flatten } from 'fp-ts/es6/Array';
import { Setoid } from 'fp-ts/es6/Setoid';
import { Route, Vehicles, Vehicle } from './types';

const Layout = styled.div`
  display: grid;

  width: 100vw;
  height: 100vh;

  grid-template-rows: 4rem auto;
`;

// Connects to realtime API
const useRealTimeApi = (endpoint: string) => {
  const [apiState, setApi] = useState<Option<MqttClient>>(none);

  useEffect(() => {
    console.log(`Connecting to ${endpoint}`);
    const client = connect(endpoint);
    setApi(some(client));

    // Disconnect on cleanup
    return () => {
      client.end();
    };
  }, []);

  return [apiState, setApi] as [typeof apiState, typeof setApi];
};

const setoidRoute: Setoid<Route> = {
  equals: (x, y) => x.gtfsId === y.gtfsId,
};

// gtfsId is in format HSL:1234, mqtt wants only 1234 part
const gtfsIdRe = /.+:(.+)/;
const getSubscriptionTopic = (route: Route) =>
  fromNullable(route.gtfsId.match(gtfsIdRe))
    .chain(last)
    .map(lineId => `/hfp/v1/journey/+/+/+/+/${lineId}/#`);

// Subscribes to given routes
const useRouteSubscriptions = (routes: Route[]) => (
  client: Option<MqttClient>,
) => {
  const prevRoutes = useRef(routes);

  useEffect(() => {
    client.map(client => {
      // Subscribe to given routes
      array.map(mapOption(routes, getSubscriptionTopic), sub => {
        console.log(`Subscribing to ${sub}`);
        client.subscribe(sub);
      });

      // Unsubscribe from routes that we no longer subscribe to
      const removedSubscriptions = difference(setoidRoute)(
        prevRoutes.current,
        routes,
      );

      array.map(
        mapOption(removedSubscriptions, getSubscriptionTopic),
        client.unsubscribe,
      );

      // Remember previous routes state
      prevRoutes.current = routes;
    });
  }, [routes, client]);
};

import * as t from 'io-ts';
import { StrMap, pop, remove, insert } from 'fp-ts/es6/StrMap';

const ApiVehicle = t.type({
  acc: t.number,
  desi: t.string,
  dir: t.string,
  dl: t.number,
  drst: t.number,
  hdg: t.number,
  jrn: t.number,
  line: t.number,
  oday: t.string,
  odo: t.number,
  oper: t.number,
  spd: t.number,
  start: t.string,
  tsi: t.number,
  tst: t.string,
  veh: t.number,

  // these two being absent means something along the lines of: vehicle
  // transponder went offline - remove vehicle from map
  lat: t.union([t.number, t.undefined]),
  long: t.union([t.number, t.undefined]),
});

const ApiVehicleResponse = t.type({
  VP: ApiVehicle,
});

/**
 * Unique ID for a vehicle
 * @param gtfsId Route gtfsId identifier.
 * @param vehicleNo Vehicle No. - unique within a route.
 */
const getVehicleId = (gtfsId: string, vehicleNo: number) =>
  `${gtfsId}/${vehicleNo}`;

const useRealtimeData = (routes: Route[]) => (client: Option<MqttClient>) => {
  const data = useRef<StrMap<Vehicle>>(new StrMap({}));

  useEffect(() => {
    const listener = (topic: string, message: Buffer) => {
      ApiVehicleResponse.decode(JSON.parse(message.toString())).map(
        ({ VP: apiVehicle }) => {
          const route = routes.find(
            route => route.shortName === apiVehicle.desi,
          );

          if (!route) return;

          const vehicleId = getVehicleId(route.gtfsId, apiVehicle.veh);

          if (!apiVehicle.long || !apiVehicle.lat) {
            // Vehicle transponder offline, remove vehicle
            data.current = remove(vehicleId, data.current);
          } else {
            // Update vehicle location
            data.current = insert(
              vehicleId,
              {
                coordinates: [apiVehicle.long, apiVehicle.lat],
                gtfsId: route.gtfsId,
                lastUpdate: new Date().getTime(),
              },
              data.current,
            );
          }
        },
      );
    };

    client.map(api => api.on('message', listener));
    return () => {
      client.map(api => api.off('message', listener));
    };
  }, [client, routes]);

  return data;
};

const routes: Route[] = [{ gtfsId: 'HSL:1010', shortName: '10' }];

export const App: React.FunctionComponent = () => {
  const [rtApi] = useRealTimeApi('wss://mqtt.hsl.fi');
  useRouteSubscriptions(routes)(rtApi);

  const vehicles = useRealtimeData(routes)(rtApi);

  return (
    <Layout>
      <Header />
      <Map rtApi={rtApi} routes={routes} vehicles={vehicles} />
    </Layout>
  );
};
