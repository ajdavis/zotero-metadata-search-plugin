import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";

interface SearchResult {
  source: string;
  title: string;
  creators: any[];
  fields: Record<string, string>;
  similarity: number;
}

type SourceKey = "crossref" | "dblp" | "openalex" | "arxiv";
type EnablePref = `${SourceKey}-enable`;

const SOURCES: { key: SourceKey; label: string }[] = [
  { key: "crossref", label: "CrossRef.org" },
  { key: "dblp", label: "DBLP.org" },
  { key: "openalex", label: "OpenAlex.org" },
  { key: "arxiv", label: "arXiv.org" },
];

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] || "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export class MetadataSearchPlugin {
  static registerRightClickMenuItem() {
    // This API is deprecated and will be removed from zotero-plugin-toolkit 6 mos after Zotero 8 is
    // released: windingwind.github.io/zotero-plugin-toolkit/reference/Class.MenuManager.html
    // The replacement Zotero.MenuManager.registerMenu isn't available on Zotero 7.
    // TODO: check Zotero version at runtime and use the new API when available.
    // TODO: also remove menuitem-label-ztoolkit from locale file.
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-metadata-search-plugin-rightclick-menuitem",
      label: getString("menuitem-label-ztoolkit"),
      commandListener: (ev) => {
        const itemID: number = Number(
          // @ts-expect-error - composedTarget is not typed
          ev.composedTarget?.parentNode?.attributes.getNamedItem("itemID")
            ?.value,
        );
        this.showMetadataSearchDialog(itemID);
      },
      onShowing: (elem, ev) => {
        const regularItemsSelected =
          Zotero.getMainWindow()
            .ZoteroPane.getSelectedItems()
            .filter((item) => item.isRegularItem()).length > 0;
        elem.disabled = !regularItemsSelected;
      },
    });

    /*
    const darkIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon-dark@0.5x.png`;
    // @ts-expect-error - MenuManager is not typed
    Zotero.MenuManager.registerMenu({
      menuID: `${addon.data.config.addonRef}-rightclick-menuitem`,
      pluginID: addon.data.config.addonID,
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: `${addon.data.config.addonRef}-menuitem-label`,
          icon: icon,
          darkIcon: darkIcon,
          onCommand: (event: any, context: any) => {
            this.showMetadataSearchDialog(context.items[0]?.id);
          },
          onShowing: (event: any, context: any) => {
            context.setEnabled(context.items[0]?.isRegularItem());
            return true;
          },
        },
      ],
    });
    */
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
    const data = (await response.json()) as any;
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
    const data = (await response.json()) as any;
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
          .map((a: any) => ({
            creatorType: "author",
            ...splitName(a.text || a),
          }))
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

  private static async searchOpenAlex(
    title: string,
    _creators: string[],
  ): Promise<SearchResult[]> {
    const url =
      `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(title)}` +
      `&per-page=10&sort=relevance_score:desc`;
    ztoolkit.log("OpenAlex URL:", url);
    const response = await fetch(url);
    ztoolkit.log("OpenAlex response status:", response.status);
    const data = (await response.json()) as any;
    const results: SearchResult[] = [];

    for (const work of data.results || []) {
      const fields: Record<string, string> = {};

      if (work.title) fields.title = String(work.title);
      if (work.doi) fields.DOI = String(work.doi).replace(/^https?:\/\/doi\.org\//, "");
      if (work.publication_date) fields.date = String(work.publication_date);
      else if (work.publication_year) fields.date = String(work.publication_year);
      if (work.language) fields.language = String(work.language);

      const biblio = work.biblio || {};
      if (biblio.volume) fields.volume = String(biblio.volume);
      if (biblio.issue) fields.issue = String(biblio.issue);
      if (biblio.first_page && biblio.last_page) {
        fields.pages = `${biblio.first_page}-${biblio.last_page}`;
      } else if (biblio.first_page) {
        fields.pages = String(biblio.first_page);
      }

      const source = work.primary_location?.source;
      if (source?.display_name) fields.publicationTitle = String(source.display_name);
      if (work.primary_location?.landing_page_url) {
        fields.url = String(work.primary_location.landing_page_url);
      }

      const creators = (work.authorships || [])
        .map((a: any) => ({
          creatorType: "author",
          ...splitName(a.author?.display_name || a.raw_author_name || ""),
        }))
        .filter((c: any) => c.firstName || c.lastName);

      results.push({
        source: "OpenAlex",
        title: fields.title || "",
        creators,
        fields,
        similarity: this.titleSimilarity(title, fields.title || ""),
      });
    }
    ztoolkit.log("OpenAlex results:", results.length);
    return results;
  }

  private static async searchArxiv(
    title: string,
    _creators: string[],
  ): Promise<SearchResult[]> {
    const url =
      `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(`"${title}"`)}` +
      `&max_results=10`;
    ztoolkit.log("arXiv URL:", url);
    const response = await fetch(url);
    ztoolkit.log("arXiv response status:", response.status);
    const xmlText = await response.text();
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const results: SearchResult[] = [];

    const textOf = (parent: any, tag: string): string => {
      const el = parent.getElementsByTagName(tag)[0];
      return el?.textContent?.trim() || "";
    };

    const entries: any[] = Array.from(doc.getElementsByTagName("entry") as any);
    for (const entry of entries) {
      const fields: Record<string, string> = {};
      const entryTitle = textOf(entry, "title");
      if (entryTitle) fields.title = entryTitle.replace(/\s+/g, " ");
      const summary = textOf(entry, "summary");
      if (summary) fields.abstractNote = summary.replace(/\s+/g, " ");
      const published = textOf(entry, "published");
      if (published) fields.date = published.split("T")[0];

      const arxivId = textOf(entry, "id").replace(/^https?:\/\/arxiv\.org\/abs\//, "");
      if (arxivId) fields.url = `https://arxiv.org/abs/${arxivId}`;

      const doi = textOf(entry, "arxiv:doi");
      if (doi) fields.DOI = doi;
      else if (arxivId) fields.DOI = `10.48550/arxiv.${arxivId.replace(/v\d+$/, "")}`;

      const journalRef = textOf(entry, "arxiv:journal_ref");
      if (journalRef) fields.publicationTitle = journalRef;

      const authorEls: any[] = Array.from(
        entry.getElementsByTagName("author") as any,
      );
      const creators = authorEls
        .map((a) => ({
          creatorType: "author",
          ...splitName(textOf(a, "name")),
        }))
        .filter((c) => c.firstName || c.lastName);

      results.push({
        source: "arXiv",
        title: fields.title || "",
        creators,
        fields,
        similarity: this.titleSimilarity(title, fields.title || ""),
      });
    }
    ztoolkit.log("arXiv results:", results.length);
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
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        },
      })
      .addButton("Update", "update")
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

    updateButtonState();

    const createFieldDiv = (
      key: string,
      value: string,
      withCheckbox: boolean = false,
      creatorData?: any[],
    ): HTMLDivElement => {
      const fieldDiv = doc.createElement("div")!;
      fieldDiv.style.display = "flex";
      fieldDiv.style.alignItems = "center";

      if (withCheckbox) {
        const checkbox = doc.createElement("input")!;
        checkbox.type = "checkbox";
        checkbox.style.marginRight = "8px";
        checkbox.dataset.fieldName = key;
        checkbox.dataset.fieldValue = value;
        if (creatorData) {
          checkbox.dataset.creatorData = JSON.stringify(creatorData);
        }
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            // Uncheck all other checkboxes with the same field name
            const allCheckboxes = doc.querySelectorAll(
              `input[type="checkbox"][data-field-name="${key}"]`,
            );
            allCheckboxes.forEach((cb: Element) => {
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

    container.appendChild(createFieldDiv("title", itemTitle));
    container.appendChild(createFieldDiv("creators", creators.join(", ")));
    for (const [key, value] of Object.entries(fields)) {
      if (key === "title") continue;
      container.appendChild(createFieldDiv(key, value));
    }

    const searchOptionsDiv = doc.createElement("div")!;
    searchOptionsDiv.style.marginTop = "20px";
    searchOptionsDiv.style.display = "flex";
    searchOptionsDiv.style.gap = "20px";

    for (const { key, label: sourceLabel } of SOURCES) {
      const pref = `${key}-enable` as EnablePref;
      const checkbox = doc.createElement("input")!;
      checkbox.type = "checkbox";
      checkbox.id = `${key}-checkbox`;
      checkbox.checked = getPref(pref);

      const label = doc.createElement("label")!;
      label.htmlFor = `${key}-checkbox`;
      label.textContent = sourceLabel;
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "5px";
      label.insertBefore(checkbox, label.firstChild);

      searchOptionsDiv.appendChild(label);

      checkbox.addEventListener("change", () => {
        setPref(pref, checkbox.checked);
      });
    }

    container.appendChild(searchOptionsDiv);

    const updateButton = doc.querySelector(
      'button[id="update"]',
    ) as HTMLButtonElement;
    if (updateButton) {
      updateButton.addEventListener("click", async () => {
        const checkedBoxes = doc.querySelectorAll(
          'input[type="checkbox"][data-field-name]:checked',
        ) as NodeListOf<HTMLInputElement>;

        checkedBoxes.forEach((checkbox: HTMLInputElement) => {
          const fieldName = checkbox.dataset.fieldName!;
          const fieldValue = checkbox.dataset.fieldValue!;
          const creatorData = checkbox.dataset.creatorData;

          if (fieldName === "creators" && creatorData) {
            item.setCreators(JSON.parse(creatorData));
          } else {
            const fieldID = Zotero.ItemFields.getID(fieldName);
            if (Zotero.ItemFields.isValidForType(fieldID, item.itemTypeID)) {
              item.setField(fieldName, fieldValue);
            }
          }
        });

        ztoolkit.log("Updating item with selected metadata...");
        const updated: boolean = (await item.saveTx()) as boolean;
        ztoolkit.log(`Item updated: ${updated}`);
        dialogHelper.window?.close();
      });
    }

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

      const searchFns: Record<
        SourceKey,
        (t: string, c: string[]) => Promise<SearchResult[]>
      > = {
        crossref: this.searchCrossRef.bind(this),
        dblp: this.searchDBLP.bind(this),
        openalex: this.searchOpenAlex.bind(this),
        arxiv: this.searchArxiv.bind(this),
      };
      const searchPromises: Promise<SearchResult[]>[] = SOURCES.filter(
        ({ key }) => getPref(`${key}-enable` as EnablePref),
      ).map(({ key }) => searchFns[key](itemTitle, creators));

      const allResults: SearchResult[] = [];
      const resultsArrays = await Promise.allSettled(searchPromises);
      for (const result of resultsArrays) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value);
        }
      }

      allResults.sort((a, b) => a.similarity - b.similarity);

      progressElement.innerHTML = `Found ${allResults.length} results`;

      const createCheckButton = (
        text: string,
        resultSection: HTMLElement,
        checked: boolean,
      ): HTMLButtonElement => {
        const button = doc.createElement("button")!;
        button.textContent = text;
        button.style.padding = "3px 10px";
        button.addEventListener("click", () => {
          const checkboxes = resultSection.querySelectorAll(
            'input[type="checkbox"][data-field-name]',
          ) as NodeListOf<HTMLInputElement>;
          checkboxes.forEach((cb: HTMLInputElement) => {
            cb.checked = checked;
          });
          updateButtonState();
        });
        return button;
      };

      for (const result of allResults) {
        const resultSection = doc.createElement("div")!;
        resultSection.style.marginTop = "20px";

        const title = doc.createElement("h3")!;
        title.innerHTML = `${result.title} (${result.source})`;
        resultSection.appendChild(title);

        const buttonContainer = doc.createElement("div")!;
        buttonContainer.style.marginBottom = "10px";
        buttonContainer.style.display = "flex";
        buttonContainer.style.gap = "10px";

        buttonContainer.appendChild(
          createCheckButton("Check All", resultSection, true),
        );
        buttonContainer.appendChild(
          createCheckButton("Uncheck All", resultSection, false),
        );

        resultSection.appendChild(buttonContainer);

        if (result.creators.length > 0) {
          resultSection.appendChild(
            createFieldDiv(
              "creators",
              result.creators
                .map((c: any) => `${c.firstName} ${c.lastName}`.trim())
                .join(", "),
              true,
              result.creators,
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
