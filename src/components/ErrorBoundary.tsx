import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any uncaught render error (e.g. a message row with an
 * unexpected shape) unmounts the entire React tree and leaves a blank
 * screen with no indication of what happened — the only way back in was
 * refreshing. This catches it, logs the real error, and offers a reload
 * instead of a silent blank page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <p className="text-base font-semibold text-foreground">Something went wrong</p>
          <p className="text-base text-muted-foreground max-w-xs">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-base font-semibold"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
