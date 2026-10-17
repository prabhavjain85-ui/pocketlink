import React from "react";

/**
 * Catches render errors in a subtree and shows an inline alert instead of crashing the page.
 */
export default class InlineErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[InlineErrorBoundary]", error, info?.componentStack);
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      const message =
        this.props.fallbackMessage ||
        "Something went wrong while rendering this section.";
      return (
        <div
          role="alert"
          style={{
            marginTop: this.props.marginTop ?? 16,
            padding: "12px 14px",
            fontSize: "12px",
            color: "var(--red, #B91C1C)",
            background: "var(--red-bg, #FEF2F2)",
            border: "1px solid var(--red-border, #FECACA)",
            borderRadius: "var(--radius)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600 }}>{message}</div>
          {this.props.showDetail && error?.message && (
            <div style={{ marginTop: 6, fontWeight: 400, opacity: 0.9 }}>{error.message}</div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
