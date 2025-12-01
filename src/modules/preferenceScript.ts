import { config } from "../../package.json";
import { getString } from "../utils/locale";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      crossRefEnabled: Zotero.Prefs.get(`${config.addonRef}.crossref-enable`),
      dblpEnabled: Zotero.Prefs.get(`${config.addonRef}.dblp-enable`),
    };
  } else {
    addon.data.prefs.window = _window;
  }
  addon.data.prefs.window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-crossref-enable`,
  )!.checked = addon.data.prefs.crossRefEnabled;
  addon.data.prefs.window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-dblp-enable`,
  )!.checked = addon.data.prefs.dblpEnabled;
  updateWarningMessage();
  bindPrefEvents();
}

function updateWarningMessage() {
  const prefs = addon.data.prefs!;
  const warningMessage = prefs.window.document.querySelector(
    `#no-search-engines-warning-message`,
  ) as HTMLDivElement;
  
  ztoolkit.log("Updating warning message visibility, crossRefEnabled:", prefs.crossRefEnabled, "dblpEnabled:", prefs.dblpEnabled);

  if (!prefs.crossRefEnabled && !prefs.dblpEnabled) {
    warningMessage.style.display = "block";
  } else {
    warningMessage.style.display = "none";
  }
}

function bindPrefEvents() {
  const prefs = addon.data.prefs!;
  prefs.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-crossref-enable`,
    )
    ?.addEventListener("command", (e: Event) => {
      prefs.crossRefEnabled = (e.target as XUL.Checkbox).checked;
      updateWarningMessage();
    });
  prefs.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-dblp-enable`,
    )
    ?.addEventListener("command", (e: Event) => {
      prefs.dblpEnabled = (e.target as XUL.Checkbox).checked;
      updateWarningMessage();
    });
}
