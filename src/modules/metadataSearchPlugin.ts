import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";

interface SearchResult {
  source: string;
  title: string;
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
    for (const item of data.message?.items || []) {
      const fields: Record<string, string> = {};
      if (item.title?.[0]) fields.title = item.title[0];
      if (item.author) {
        fields.author = item.author
          .map((a: any) => `${a.given || ""} ${a.family || ""}`.trim())
          .join(", ");
      }
      if (item.published) {
        const date = item.published["date-parts"]?.[0];
        if (date) fields.date = date.join("-");
      }
      if (item["container-title"]?.[0]) {
        fields.publicationTitle = item["container-title"][0];
      }
      if (item.DOI) fields.DOI = item.DOI;
      if (item.publisher) fields.publisher = item.publisher;
      if (item.volume) fields.volume = item.volume;
      if (item.issue) fields.issue = item.issue;
      if (item.page) fields.pages = item.page;
      results.push({
        source: "CrossRef",
        title: fields.title || "",
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
    for (const hit of data.result?.hits?.hit || []) {
      const info = hit.info;
      const fields: Record<string, string> = {};
      if (info.title) fields.title = info.title;
      if (info.authors?.author) {
        const authors = Array.isArray(info.authors.author)
          ? info.authors.author
          : [info.authors.author];
        fields.author = authors.map((a: any) => a.text || a).join(", ");
      }
      if (info.year) fields.date = info.year;
      if (info.venue) fields.publicationTitle = info.venue;
      if (info.doi) fields.DOI = info.doi;
      if (info.ee) fields.url = info.ee;
      results.push({
        source: "DBLP",
        title: fields.title || "",
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

    for (const [key, value] of Object.entries(fields)) {
      const fieldDiv = doc.createElement("div")!;
      fieldDiv.style.display = "flex";
      fieldDiv.style.alignItems = "center";

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

      container.appendChild(fieldDiv);
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
        title.innerHTML = `${result.source}: ${result.title}`;
        resultSection.appendChild(title);

        for (const [key, value] of Object.entries(result.fields)) {
          const fieldDiv = doc.createElement("div")!;
          fieldDiv.style.display = "flex";
          fieldDiv.style.alignItems = "center";

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
          resultSection.appendChild(fieldDiv);
        }

        resultsContainer.appendChild(resultSection);
      }

      searchButton.disabled = false;
    });

    await dialogData.unloadLock.promise;
    addon.data.dialog = undefined;
  }
}
