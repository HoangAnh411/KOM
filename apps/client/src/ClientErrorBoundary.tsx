import { Component, type ErrorInfo, type ReactNode } from "react";
import { diagnostics, downloadDiagnostics } from "./diagnostics.js";
import { Button } from "./ui/Button.js";

interface Props { readonly children: ReactNode; }
interface State { readonly failed: boolean; }

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    diagnostics.add({
      kind: "react.render_error",
      message: "React render failed",
      error,
      // Component stacks can contain developer paths; the diagnostic sanitizer
      // normalizes paths and bounds the retained text before storing it.
      details: { componentStack: info.componentStack },
    });
  }

  private retry = () => { this.setState({ failed: false }); };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" aria-live="assertive">
      <h1>Ứng dụng gặp sự cố</h1>
      <p>Đã ghi lại thông tin kỹ thuật đã loại bỏ dữ liệu nhạy cảm.</p>
      <Button variant="primary" onClick={this.retry}>Thử lại</Button>
      <Button variant="secondary" onClick={() => downloadDiagnostics()}>Xuất chẩn đoán</Button>
    </main>;
  }
}
