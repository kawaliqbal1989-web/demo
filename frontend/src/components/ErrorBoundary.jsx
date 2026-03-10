import React from "react";
import ErrorState from "./ErrorState";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error, info);
    }
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      return (
        <ErrorState
          title="Application error"
          message="An unexpected error occurred while rendering this section."
          details={error?.toString()}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
