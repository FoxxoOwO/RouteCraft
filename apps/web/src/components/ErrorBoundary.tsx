import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in RouteCraft UI:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F19] p-6 text-slate-100">
          <div className="max-w-md w-full rounded-2xl bg-[#111827] border border-red-500/30 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-3 bg-red-950/60 rounded-xl border border-red-800/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Simulation Error</h2>
                <p className="text-xs text-red-300">An unexpected exception occurred</p>
              </div>
            </div>

            <div className="rounded-lg bg-black/60 p-3 font-mono text-xs text-red-200 overflow-x-auto max-h-40 border border-gray-800 mb-5">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>

            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 text-white cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload RouteCraft
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
