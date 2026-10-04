import { interfaceText } from '@/shared/content/interface';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError } from '@/shared/lib/lazyWithReload';

interface Props {
  /** Shown in the fallback, e.g. the feature name. */
  label?: string;
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Changing this value resets the boundary (e.g. pass location.pathname). */
  resetKey?: unknown;
}
interface State {
  error: Error | null;
}

/**
 * Fault isolation: a crash inside one feature (map SDK, mermaid, a game bug…) is contained
 * to that feature instead of blanking the whole site.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? 'app'}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="error-box" role="alert">
        <strong>{this.props.label ?? interfaceText("这里")}{interfaceText("出了点小状况")}</strong>
        <p className="muted">{error.message}</p>
        {isChunkLoadError(error) ? (
          <button className="btn" onClick={() => window.location.reload()}>
            {interfaceText("网站已更新，刷新页面")}</button>
        ) : (
          <button className="btn" onClick={this.reset}>
            {interfaceText("重试")}</button>
        )}
      </div>
    );
  }
}
