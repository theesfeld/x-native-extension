import { installActions } from "./actions.js";
import { installPaste } from "./paste.js";
import { createToaster } from "./toast.js";
import { installVideoTracker } from "./video-tracker.js";

if (!globalThis.__xneInstalled) {
  globalThis.__xneInstalled = true;
  if (document.documentElement) document.documentElement.dataset.xneReady = "1";
  const toaster = createToaster();
  installVideoTracker();
  installPaste({ showToast: toaster.show });
  installActions({ showToast: toaster.show, setToastHidden: toaster.setHidden });
}
