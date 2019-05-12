import React from 'react';
import ReactDOM from 'react-dom';
import * as Sentry from '@sentry/browser';
import './index.css';
import { App } from './App';
import * as serviceWorker from './serviceWorker';

Sentry.init({
  dsn: 'https://987cf99b07134888b7fd082da601c6a3@sentry.io/1441544',
});

interface State {
  error?: any;
  eventId?: string;
}

export class SentryWrapper extends React.PureComponent<State> {
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

    return <App />;
  }
}

ReactDOM.render(<SentryWrapper />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
