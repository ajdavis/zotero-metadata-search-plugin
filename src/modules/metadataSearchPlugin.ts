import { getString } from "../utils/locale";

export class MetadataSearchPlugin {
  static registerPrefs() {
    Zotero.PreferencePanes.register({
      pluginID: addon.data.config.addonID,
      src: rootURI + "content/preferences.xhtml",
      label: getString("prefs-title"),
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
    });
  }

  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
    // item menuitem with icon
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-metadata-search-plugin-rightclick-menuitem",
      label: getString("menuitem-label"),
      commandListener: (ev) => {
        const itemID: number = Number(
          ev.composedTarget?.parentNode?.attributes.getNamedItem("itemID")
            ?.value,
        );
        this.showMetadataSearchDialog(itemID);
      },
      icon: menuIcon,
    });
  }

  static async showMetadataSearchDialog(itemID?: number) {
    if (!itemID) {
      ztoolkit.log("No item ID provided for Metadata Search dialog.");
      return;
    }
    const item = await Zotero.Items.getAsync(itemID);
    ztoolkit.log("Showing Metadata Search Dialog for item:", item);
    if (!item?.isRegularItem()) {
      ztoolkit.log("Selected item is not a regular item.");
      ztoolkit.getGlobal("alert")("Selected item is not a regular item.");
      return;
    }

    const fields: Record<string, string> = {};
    const fieldNames = item.getUsedFields(true);
    for (const fieldName of fieldNames) {
      if (["abstractnote", "url"].includes(fieldName.toLowerCase())) {
        continue; // Skip long text fields
      }

      const value = item.getField(fieldName);
      if (value) {
        fields[fieldName] = String(value);
      }
    }

    const dialogData: { [key: string | number]: any } = {
      loadCallback: () => {
        ztoolkit.log(dialogData, "Dialog Opened!");
      },
      unloadCallback: () => {
        ztoolkit.log(dialogData, "Dialog closed!");
      },
    };

    const numRows = 2 + Object.keys(fields).length;
    const dialogHelper = new ztoolkit.Dialog(numRows, 1)
      .setDialogData(dialogData)
      .addCell(0, 0, {
        tag: "h2",
        properties: { innerHTML: "Item Metadata" },
      });

    let row = 2;
    for (const [key, value] of Object.entries(fields)) {
      dialogHelper.addCell(row, 0, {
        tag: "div",
        styles: {
          display: "flex",
          alignItems: "center",
        },
        children: [
          {
            tag: "span",
            styles: {
              width: "120px",
              textAlign: "right",
              fontWeight: "bold",
              marginRight: "8px",
            },
            properties: { textContent: `${key}:` },
          },
          {
            tag: "span",
            properties: { textContent: value },
          },
        ],
      });
      row++;
    }

    dialogHelper.addButton("Close", "close").open("Metadata Search");

    addon.data.dialog = dialogHelper;
    await dialogData.unloadLock.promise;
    addon.data.dialog = undefined;
    ztoolkit.log(dialogData);
  }
}
