import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-white z-[99999] overflow-auto p-8">
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 m-4 rounded">
            <h2 className="font-bold text-lg mb-2">Something went wrong.</h2>
            <details style={{ whiteSpace: 'pre-wrap' }}>
              <summary>Show Error Details</summary>
              <div className="mt-2 text-sm font-mono">
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </div>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
