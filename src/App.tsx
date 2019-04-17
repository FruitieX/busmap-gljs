import React from 'react';
import styled from 'styled-components';
import * as Sentry from '@sentry/browser';

import { Header } from './Header';
import { Map } from './Map';

const Layout = styled.div`
  display: grid;

  width: 100vw;
  height: 100vh;

  grid-template-rows: 2rem auto;
`;

interface State {
  error?: any;
  eventId?: string;
}

export class App extends React.PureComponent<State> {
  state: State = {};

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ error });
    Sentry.withScope(scope => {
      scope.setExtras(errorInfo);
      const eventId = Sentry.captureException(error);
      this.setState({ eventId });
    });
  }

  render() {
    if (this.state.error) {
      //render fallback UI
      return (
        <a
          onClick={() =>
            Sentry.showReportDialog({ eventId: this.state.eventId })
          }
        >
          Report feedback
        </a>
      );
    }

    return (
      <Layout>
        <Header />
        <Map />
      </Layout>
    );
  }
}
