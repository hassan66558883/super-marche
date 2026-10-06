import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import i18n from '@/i18n';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <h1 className="mt-3 text-lg font-semibold">{i18n.t('errors.boundary')}</h1>
        <pre className="mt-2 max-w-xl overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">{this.state.error.message}</pre>
        <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => location.reload()}>
          {i18n.t('common.refresh')}
        </button>
      </div>
    );
  }
}
