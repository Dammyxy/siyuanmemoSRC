import { Constants, openTab } from 'siyuan';

type OpenTabOptions = Parameters<typeof openTab>[0];
type OpenTabDocOptions = NonNullable<OpenTabOptions['doc']>;
type OpenTabAction = NonNullable<OpenTabDocOptions['action']>[number];
type OpenTabPayload = OpenTabOptions & {
  openInNewWindow?: boolean;
};

export interface OpenReviewBlockAtSourceOptions {
  app: OpenTabOptions['app'];
  blockId: string;
  position?: OpenTabOptions['position'];
  openNewTab?: boolean;
  openInNewWindow?: boolean;
  zoomIn?: OpenTabDocOptions['zoomIn'];
}

function resolveFocusAction(): OpenTabAction {
  const focusAction = Constants?.CB_GET_FOCUS;
  if (typeof focusAction === 'string' && focusAction.length > 0) {
    return focusAction as OpenTabAction;
  }
  return 'cb-get-focus' as OpenTabAction;
}

export async function openReviewBlockAtSource(options: OpenReviewBlockAtSourceOptions): Promise<void> {
  const {
    app,
    blockId,
    position,
    openNewTab,
    openInNewWindow,
    zoomIn,
  } = options;

  if (!blockId) {
    return;
  }

  const doc: OpenTabDocOptions = {
    id: blockId,
    action: [resolveFocusAction()],
  };
  if (typeof zoomIn === 'boolean') {
    doc.zoomIn = zoomIn;
  }

  const payload: OpenTabPayload = {
    app,
    doc,
  };
  if (position) {
    payload.position = position;
  }
  if (typeof openNewTab === 'boolean') {
    payload.openNewTab = openNewTab;
  }
  if (typeof openInNewWindow === 'boolean') {
    payload.openInNewWindow = openInNewWindow;
  }

  await openTab(payload);
}
