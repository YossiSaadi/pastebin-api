import { XMLParser } from "fast-xml-parser";
import { fetch } from "./fetch.js";
import type {
  CreateOptions,
  GetPastesOptions,
  ParsedPaste,
  DeletePasteOptions,
  ClientOptions,
  GetRawPasteOptions,
  LoginOptions,
} from "./types.js";

const ERROR_PREFIX = "[pastebin-api]:" as const;

export default class PasteClient {
  private apiKey: string;
  private domain = "pastebin.com";

  protected parser = new XMLParser();

  private get pasteBinUrl() {
    return `https://${this.domain}/api/api_post.php`;
  }

  private get loginUrl() {
    return `https://${this.domain}/api/api_login.php`;
  }

  private get rawUrl() {
    return `https://${this.domain}/api/api_raw.php`;
  }

  constructor(options: string | ClientOptions) {
    if (!options) {
      throw new TypeError(`${ERROR_PREFIX} 'options' must be type 'string' or type 'object'`);
    }

    if (typeof options === "string") {
      this.apiKey = options;
    } else {
      this.apiKey = options.apiKey;
      this.domain = options.domain ?? "pastebin.com";
    }
  }

  /**
   * creates the paste
   * @param {Options} options The options for the paste
   * @returns {Promise<string>} The URL of the created paste
   * @see [https://pastebin.com/doc_api#2](https://pastebin.com/doc_api#2)
   */
  async createPaste(options: CreateOptions): Promise<string> {
    if (options.name && options.name.length > 100) {
      throw new TypeError(`${ERROR_PREFIX} Name of paste cannot be longer than 100 characters`);
    }

    const res = await fetch(this.pasteBinUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.encode({
        api_dev_key: this.apiKey,
        api_option: "paste",
        api_paste_name: options.name ?? "Untitled",
        api_paste_code: options.code,
        api_paste_format: options.format ?? "javascript",
        api_paste_private: options.publicity ?? 0,
        api_paste_expire_date: options.expireDate ?? "N",
        api_user_key: options.apiUserKey ?? "",
        api_folder_key: options.folderKey ?? "",
      }),
    });

    const url = await res.body.text();

    if (url.toLowerCase().startsWith("bad api request")) {
      return Promise.reject(url);
    }

    return url;
  }

  /**
   * get a limit of 1000 pastes from the logged in user
   * @param {GetPastesOptions} options
   * @returns An array of all the user's pastes
   * @see [https://pastebin.com/doc_api#10](https://pastebin.com/doc_api#10)
   */
  async getPastesByUser(options: GetPastesOptions): Promise<ParsedPaste[]> {
    if (options.limit && (options.limit < 1 || options.limit > 1000)) {
      throw new TypeError(`${ERROR_PREFIX} Limit cannot be lower than 1 or higher than 1000`);
    }

    if (!options.userKey) {
      throw new TypeError(
        `${ERROR_PREFIX} 'userKey' must be provided (PasteClient#getPastesByUser)`,
      );
    }

    const res = await fetch(this.pasteBinUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.encode({
        api_dev_key: this.apiKey,
        api_user_key: options.userKey,
        api_results_limit: options.limit,
        api_option: "list",
      }),
    });

    const data = await res.body.text();
    if (data.toLowerCase().startsWith("bad api request")) {
      return Promise.reject(data);
    }

    // if no pastes are found simply return an empty array
    if (data.toLowerCase().startsWith("no pastes found")) {
      return [];
    }

    const parsed = this.parser.parse(data);

    // it can either return an array or an object
    if (Array.isArray(parsed["paste"])) {
      return parsed["paste"];
    }

    return [parsed["paste"]];
  }

  /**
   * delete a paste by it's key
   * @param {DeletePasteOptions} options
   * @returns {boolean} Whether it was deleted or not
   * @see [https://pastebin.com/doc_api#11](https://pastebin.com/doc_api#11)
   */
  async deletePasteByKey(options: DeletePasteOptions): Promise<boolean> {
    if (!options.userKey) {
      throw new TypeError(
        `${ERROR_PREFIX} 'userKey' must be provided (PasteClient#deletePasteByKey)`,
      );
    }

    if (!options.pasteKey) {
      throw new TypeError(
        `${ERROR_PREFIX} 'pasteKey' must be provided (PasteClient#deletePasteByKey)`,
      );
    }

    const res = await fetch(this.pasteBinUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.encode({
        api_dev_key: this.apiKey,
        api_option: "delete",
        api_paste_key: options.pasteKey,
        api_user_key: options.userKey,
      }),
    });

    const data = await res.body.text();
    if (data.toLowerCase().startsWith("bad api request")) {
      return Promise.reject(data);
    }

    // paste was successfully removed
    return data.toLowerCase().startsWith("paste removed");
  }

  /**
   * return raw paste by it's key
   * @param {GetRawPasteOptions} options
   * @returns {string} The raw paste
   * @see [https://pastebin.com/doc_api#14](https://pastebin.com/doc_api#14)
   */
  async getRawPasteByKey(options: GetRawPasteOptions): Promise<string> {
    if (!options.pasteKey) {
      throw new TypeError(
        `${ERROR_PREFIX} 'pasteKey' must be provided (PasteClient#getRawPasteByKey)`,
      );
    }

    const res = await fetch(this.rawUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.encode({
        api_option: "show_paste",
        api_dev_key: this.apiKey,
        api_user_key: options.userKey || "",
        api_paste_key: options.pasteKey,
      }),
    });

    const data = await res.body.text();
    if (data.toLowerCase().startsWith("bad api request")) {
      return Promise.reject(data);
    }

    return data;
  }

  /**
   * login to get access to more API routes
   * @param {string} name The user's name
   * @param {string} password The user's password
   * @returns The user token to use for other API routes
   * @see [https://pastebin.com/doc_api#9](https://pastebin.com/doc_api#9)
   */
  async login(options: LoginOptions): Promise<string> {
    const res = await fetch(this.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.encode({
        api_dev_key: this.apiKey,
        api_user_name: options.name,
        api_user_password: options.password,
      }),
    });

    const data = await res.body.text();
    if (data.toLowerCase().startsWith("bad api request")) {
      return Promise.reject(data);
    }

    return data;
  }

  /**
   * encodes data to valid URI
   * @param data The data you want to encode
   */
  private encode(data: Record<string, unknown>): string {
    let string = "";

    for (const [key, value] of Object.entries(data)) {
      if (!value) continue;
      string += `&${encodeURIComponent(key)}=${encodeURIComponent(`${value}`)}`;
    }

    return string.substring(1);
  }
}
