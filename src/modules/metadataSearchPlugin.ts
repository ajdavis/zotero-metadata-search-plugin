import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";

interface SearchResult {
  source: string;
  title: string;
  creators: any[];
  fields: Record<string, string>;
  similarity: number;
}

export class MetadataSearchPlugin {
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

  private static addKeyValueCell(
    dialogHelper: any,
    row: number,
    key: string,
    value: string,
  ) {
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
  }

  private static titleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const s1 = normalize(title1);
    const s2 = normalize(title2);
    const maxLen = Math.max(s1.length, s2.length);
    let matches = 0;
    const minLen = Math.min(s1.length, s2.length);
    for (let i = 0; i < minLen; i++) {
      if (s1[i] === s2[i]) matches++;
    }
    return 1 - matches / maxLen;
  }

  private static async searchCrossRef(
    title: string,
    creators: string[],
  ): Promise<SearchResult[]> {
    const query = `${title} ${creators.join(" ")}`.trim();
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10`;
    ztoolkit.log("CrossRef URL:", url);
    const response = await fetch(url);
    ztoolkit.log("CrossRef response status:", response.status);
    const data = await response.json();
    ztoolkit.log("CrossRef data:", data);
    const results: SearchResult[] = [];

    // Mapping from CrossRef fields to Zotero item fields
    const fieldMapping: Record<string, string> = {
      title: "title",
      DOI: "DOI",
      publisher: "publisher",
      volume: "volume",
      issue: "issue",
      page: "pages",
      ISBN: "ISBN",
      ISSN: "ISSN",
      "container-title": "publicationTitle",
      "short-container-title": "journalAbbreviation",
      abstract: "abstractNote",
      URL: "url",
      language: "language",
    };

    for (const item of data.message?.items || []) {
      const fields: Record<string, string> = {};
      let creators: any[] = [];

      if (item.author) {
        creators = item.author
          .map((a: any) => ({
            creatorType: "author",
            firstName: a.given || "",
            lastName: a.family || "",
          }))
          .filter((c: any) => c.firstName || c.lastName);
      }

      const dateParts =
        item.published?.["date-parts"]?.[0] ||
        item["published-print"]?.["date-parts"]?.[0] ||
        item["published-online"]?.["date-parts"]?.[0];
      if (dateParts) fields.date = dateParts.join("-");

      for (const [crossrefKey, zoteroKey] of Object.entries(fieldMapping)) {
        if (item[crossrefKey]) {
          if (
            Array.isArray(item[crossrefKey]) &&
            item[crossrefKey].length === 1
          ) {
            fields[zoteroKey] = String(item[crossrefKey][0]);
          } else {
            fields[zoteroKey] = String(item[crossrefKey]);
          }
        }
      }

      results.push({
        source: "CrossRef",
        title: fields.title || "",
        creators,
        fields,
        similarity: this.titleSimilarity(title, fields.title || ""),
      });
    }
    ztoolkit.log("CrossRef results:", results.length);
    return results;
  }

  private static async searchDBLP(
    title: string,
    creators: string[],
  ): Promise<SearchResult[]> {
    const query = `${title} ${creators.join(" ")}`.trim();
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=10`;
    ztoolkit.log("DBLP URL:", url);
    const response = await fetch(url);
    ztoolkit.log("DBLP response status:", response.status);
    const data = await response.json();
    ztoolkit.log("DBLP data:", data);
    const results: SearchResult[] = [];

    const fieldMapping: Record<string, string> = {
      title: "title",
      doi: "DOI",
      year: "date",
      venue: "publicationTitle",
      ee: "url",
      volume: "volume",
    };

    for (const hit of data.result?.hits?.hit || []) {
      const info = hit.info;
      const fields: Record<string, string> = {};
      let creators: any[] = [];

      if (info.authors?.author) {
        const authors = Array.isArray(info.authors.author)
          ? info.authors.author
          : [info.authors.author];
        creators = authors
          .map((a: any) => {
            const fullName = a.text || a;
            const nameParts = fullName.split(" ");
            return {
              creatorType: "author",
              firstName: nameParts.slice(0, -1).join(" "),
              lastName: nameParts[nameParts.length - 1] || "",
            };
          })
          .filter((c: any) => c.firstName || c.lastName);
      }

      for (const [dblpKey, zoteroKey] of Object.entries(fieldMapping)) {
        if (info[dblpKey]) fields[zoteroKey] = String(info[dblpKey]);
      }

      results.push({
        source: "DBLP",
        title: fields.title || "",
        creators,
        fields,
        similarity: this.titleSimilarity(title, fields.title || ""),
      });
    }
    ztoolkit.log("DBLP results:", results.length);
    return results;
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

    const itemTitle = item.getField("title") as string;
    const creators = item
      .getCreators()
      .map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim());

    const dialogData: { [key: string | number]: any } = {
      loadCallback: () => {
        ztoolkit.log(dialogData, "Dialog Opened!");
      },
      unloadCallback: () => {
        ztoolkit.log(dialogData, "Dialog closed!");
      },
    };

    const dialogHelper = new ztoolkit.Dialog(1, 1)
      .setDialogData(dialogData)
      .addCell(0, 0, {
        tag: "div",
        id: "content-container",
        styles: {
          overflowY: "auto",
        },
      })
      .addButton("Update", "update", { disabled: true })
      .addButton("Close", "close")
      .open("Metadata Search", {
        width: 1200,
        height: 800,
        resizable: true,
        centerscreen: true,
        alwaysRaised: true,
      });

    await dialogData.loadLock.promise;

    addon.data.dialog = dialogHelper;
    dialogHelper.window?.focus();
    const doc = dialogHelper.window?.document;
    if (!doc) {
      ztoolkit.log("Dialog document is not available.");
      return;
    }

    const container = doc.getElementById("content-container")!;
    const heading = doc.createElement("h2")!;
    heading.innerHTML = "Item Metadata";
    container.appendChild(heading);

    const updateButtonState = () => {
      const anyChecked =
        doc.querySelectorAll('input[type="checkbox"][data-field-name]:checked')
          .length > 0;
      const updateButton = doc.querySelector('button[id="update"]');
      if (updateButton) {
        (updateButton as HTMLButtonElement).disabled = !anyChecked;
      }
    };

    const createFieldDiv = (
      key: string,
      value: string,
      withCheckbox: boolean = false,
    ): HTMLDivElement => {
      const fieldDiv = doc.createElement("div")!;
      fieldDiv.style.display = "flex";
      fieldDiv.style.alignItems = "center";

      if (withCheckbox) {
        const checkbox = doc.createElement("input")!;
        checkbox.type = "checkbox";
        checkbox.style.marginRight = "8px";
        checkbox.dataset.fieldName = key;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            // Uncheck all other checkboxes with the same field name
            const allCheckboxes = doc.querySelectorAll(
              `input[type="checkbox"][data-field-name="${key}"]`,
            );
            allCheckboxes.forEach((cb) => {
              if (cb !== checkbox) {
                (cb as HTMLInputElement).checked = false;
              }
            });
          }
          updateButtonState();
        });
        fieldDiv.appendChild(checkbox);
      }

      const keySpan = doc.createElement("span")!;
      keySpan.style.width = "120px";
      keySpan.style.textAlign = "right";
      keySpan.style.fontWeight = "bold";
      keySpan.style.marginRight = "8px";
      keySpan.textContent = `${key}:`;
      fieldDiv.appendChild(keySpan);

      const valueSpan = doc.createElement("span")!;
      valueSpan.textContent = value;
      fieldDiv.appendChild(valueSpan);

      return fieldDiv;
    };

    for (const [key, value] of Object.entries(fields)) {
      container.appendChild(createFieldDiv(key, value));
    }

    const searchOptionsDiv = doc.createElement("div")!;
    searchOptionsDiv.style.marginTop = "20px";
    searchOptionsDiv.style.display = "flex";
    searchOptionsDiv.style.gap = "20px";

    for (const source of ["crossref", "dblp"]) {
      const checkbox = doc.createElement("input")!;
      checkbox.type = "checkbox";
      checkbox.id = `${source}-checkbox`;
      checkbox.checked = getPref(
        `${source}-enable` as "crossref-enable" | "dblp-enable",
      );

      const label = doc.createElement("label")!;
      label.htmlFor = `${source}-checkbox`;
      label.textContent = source === "crossref" ? "CrossRef.org" : "DBLP.org";
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "5px";
      label.insertBefore(checkbox, label.firstChild);

      searchOptionsDiv.appendChild(label);

      checkbox.addEventListener("change", () => {
        setPref(
          `${source}-enable` as "crossref-enable" | "dblp-enable",
          checkbox.checked,
        );
      });
    }

    container.appendChild(searchOptionsDiv);

    const searchButton = doc.createElement("button")!;
    searchButton.textContent = "Search";
    searchButton.style.marginTop = "10px";
    searchButton.style.padding = "5px 15px";
    container.appendChild(searchButton);

    const progressDiv = doc.createElement("div")!;
    progressDiv.id = "search-progress";
    progressDiv.style.marginTop = "20px";
    progressDiv.style.fontStyle = "italic";
    progressDiv.innerHTML = "";
    container.appendChild(progressDiv);
    const resultsDiv = doc.createElement("div")!;
    resultsDiv.id = "search-results";
    resultsDiv.style.marginTop = "10px";
    container.appendChild(resultsDiv);

    searchButton.addEventListener("click", async () => {
      const progressElement = doc.getElementById("search-progress")!;
      const resultsContainer = doc.getElementById("search-results")!;

      progressElement.innerHTML = "Searching...";
      resultsContainer.innerHTML = "";
      searchButton.disabled = true;

      const searchPromises: Promise<SearchResult[]>[] = [];
      if (getPref("crossref-enable")) {
        searchPromises.push(this.searchCrossRef(itemTitle, creators));
      }
      if (getPref("dblp-enable")) {
        searchPromises.push(this.searchDBLP(itemTitle, creators));
      }

      const allResults: SearchResult[] = [];
      const resultsArrays = await Promise.allSettled(searchPromises);
      for (const result of resultsArrays) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value);
        }
      }

      allResults.sort((a, b) => a.similarity - b.similarity);

      progressElement.innerHTML = `Found ${allResults.length} results`;

      for (const result of allResults) {
        const resultSection = doc.createElement("div")!;
        resultSection.style.marginTop = "20px";

        const title = doc.createElement("h3")!;
        title.innerHTML = `${result.title} (${result.source})`;
        resultSection.appendChild(title);
        if (result.creators.length > 0) {
          resultSection.appendChild(
            createFieldDiv(
              "creators",
              result.creators
                .map((c: any) => `${c.firstName} ${c.lastName}`.trim())
                .join(", "),
              true,
            ),
          );
        }

        for (const [key, value] of Object.entries(result.fields)) {
          resultSection.appendChild(createFieldDiv(key, value, true));
        }

        resultsContainer.appendChild(resultSection);
      }

      // Re-check the update button state after adding all results
      updateButtonState();
      searchButton.disabled = false;
    });

    await dialogData.unloadLock.promise;
    addon.data.dialog = undefined;
  }
}
