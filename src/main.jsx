import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown application error" };
  }

  componentDidCatch(error, info) {
    console.error("[app-crash]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f7f8fc", color: "#1a1a2e", fontFamily: "Inter, system-ui, sans-serif" }}>
          <div style={{ maxWidth: 760, width: "100%", background: "#fff", border: "1px solid #e8eaf0", borderRadius: 12, padding: 20 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>SchoolTime hit an unexpected error</h2>
            <p style={{ margin: "0 0 12px", color: "#4a4a6a", fontSize: 14 }}>
              Refresh the page. If the issue continues, share this message with support.
            </p>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f7f8fc", border: "1px solid #e8eaf0", borderRadius: 8, padding: 12, fontSize: 12 }}>{this.state.message}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
