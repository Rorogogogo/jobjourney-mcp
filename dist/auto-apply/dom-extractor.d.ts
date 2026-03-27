import { type Page } from "playwright";
export interface ExtractedField {
    selector: string;
    type: string;
    label: string;
    placeholder: string;
    required: boolean;
    currentValue: string;
    options: string[];
    fieldGroup: string | null;
}
export interface PageContext {
    pageTitle: string;
    stepIndicator: string | null;
    errorMessages: string[];
}
export interface ExtractionResult {
    fields: ExtractedField[];
    context: PageContext;
}
/**
 * Directly callable version for testing with jsdom.
 * Skips visibility checks since jsdom does not support layout.
 */
export declare function runExtractorInDom(): ExtractionResult;
/**
 * Returns the JavaScript source for page.evaluate() in a real browser.
 * Includes visibility and honeypot filtering.
 */
export declare function buildExtractorScript(): string;
/**
 * Extract all visible form fields from the current page, including iframes.
 */
export declare function extractFormFields(page: Page): Promise<ExtractionResult>;
