import React from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface Props {
  children: React.ReactNode;
  /** Shown instead of the default panel, e.g. to keep a crash inside one widget. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken component does not blank the entire app.
 *
 * React unmounts the whole tree when a render throws and nothing catches it, which
 * leaves the user on a white screen with no way back. This shows what happened and
 * offers a way out.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the component stack, the message alone rarely identifies the culprit.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return <>{this.props.fallback}</>;

    return (
      <div role="alert" className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-amber-500" />

          <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            This page stopped working
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Something broke while rendering. Your work is not lost, reloading usually fixes it.
          </p>

          <div className="mt-5 flex justify-center gap-3">
            <button type="button" onClick={this.reset} className="btn-secondary">
              <ArrowPathIcon className="mr-2 h-4 w-4" />
              Try again
            </button>
            <button type="button" onClick={() => window.location.assign('/')} className="btn-primary">
              Go to dashboard
            </button>
          </div>

          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-red-700 dark:bg-gray-900 dark:text-red-400">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
