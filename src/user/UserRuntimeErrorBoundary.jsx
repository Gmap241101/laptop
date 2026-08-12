import React from 'react';

class UserRuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('User workspace render error:', error, errorInfo);
  }

  componentDidUpdate(previousProps) {
    if (
      this.state.hasError &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  handleRecover = () => {
    this.setState({ hasError: false }, () => {
      this.props.onRecover?.();
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-center shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          화면을 표시하는 중 오류가 발생했습니다.
        </h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          로그인 상태는 유지됩니다. 초기화면으로 이동한 뒤 다시 시도해 주세요.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          오류 코드: user_panel_render_failed
        </p>
        <button
          type="button"
          onClick={this.handleRecover}
          className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          초기화면으로 이동
        </button>
      </div>
    );
  }
}

export default UserRuntimeErrorBoundary;
