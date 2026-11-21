import React, { ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('THIKANA App Error caught by boundary:', error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack || '' });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Unknown rendering error';
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-3xl border border-emerald-500/30">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-2xl font-black text-white">
              THIKANA Quick Reload
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              The app encountered a rendering error. The technical message below will help us identify the exact cause.
            </p>
          </div>

          <section className="w-full max-w-2xl text-left rounded-2xl border border-amber-500/40 bg-slate-900 p-4 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">Technical error</h3>
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-white">{message}</pre>
            {this.state.componentStack && (
              <details className="pt-2">
                <summary className="cursor-pointer text-xs font-bold text-emerald-300">Show component details</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-300">{this.state.componentStack}</pre>
              </details>
            )}
          </section>

          <button
            onClick={this.handleReset}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-xl transition-transform active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset & Refresh App</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
