"use client";

import { Component, type ReactNode } from "react";

/**
 * Safety net for the Leaflet map. react-leaflet 5.0.0 + React 19 can throw
 * "appendChild" errors when a map re-mounts (e.g. under Next's cached
 * components). On error we re-mount the map once (fresh key); if it errors
 * again we render a lightweight fallback instead of breaking the page.
 */
interface State {
  key: number;
  failed: boolean;
}

export class MapErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { key: 0, failed: false };

  static getDerivedStateFromError(): Partial<State> {
    return {};
  }

  componentDidCatch() {
    this.setState((s) =>
      s.key === 0 ? { key: 1, failed: false } : { key: s.key, failed: true },
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-surface2 text-sm text-muted">
          Map failed to load.
        </div>
      );
    }
    return <div key={this.state.key} className="h-full w-full">{this.props.children}</div>;
  }
}
