import { RichTextContent } from '../components/RichTextEditor.jsx';

export default function UserFooterPagePanel({ ctx }) {
  const {
    AlertCircle,
    Button,
    Card,
    CardContent,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    goToUserHome,
    selectedFooterPage,
  } = ctx;

  if (!footerPagesReady) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardContent className="py-16 text-center text-xs text-slate-400">
          푸터 페이지를 불러오는 중입니다.
        </CardContent>
      </Card>
    );
  }

  if (footerPagesLoadErrorMessage) {
    return (
      <Card className="overflow-hidden border-rose-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
            {footerPagesLoadErrorMessage}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedFooterPage || selectedFooterPage.enabled === false) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardContent className="px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <AlertCircle size={26} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">페이지를 찾을 수 없습니다.</h2>
          <p className="mt-2 text-sm text-slate-500">
            사용하지 않도록 설정되었거나 삭제된 푸터 메뉴 페이지입니다.
          </p>
          <Button type="button" variant="primary" className="mt-6" onClick={goToUserHome}>
            초기화면으로 이동
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
        <h2 className="break-words text-xl font-bold text-slate-950">
          {selectedFooterPage.title}
        </h2>
      </div>
      <CardContent className="min-h-[320px] px-6 py-7">
        <RichTextContent
          html={selectedFooterPage.contentHtml}
          text={selectedFooterPage.contentText || selectedFooterPage.content}
          className="text-sm leading-7 text-slate-700"
        />
      </CardContent>
    </Card>
  );
}
