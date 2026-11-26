import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred in the operations workspace.';
    try {
      const parsed = JSON.parse(readable);
      if (parsed?.error) {
        readable = `Cloud sync permission or connectivity issue (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'workspace'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, errorMessage: readable };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Orise DCIM ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F2F4F7] dark:bg-[#111418] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-[#1B2026] border border-red-200 dark:border-red-900/60 rounded-md p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="text-base font-semibold">Workspace Recovery Required</h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-mono break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#009530] hover:bg-[#007A27] text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Return to Operations Console
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
