import { UgigClient } from "./client.js";
import { type OutputOptions } from "./output.js";
export interface GlobalOpts extends OutputOptions {
    apiKey?: string;
    baseUrl?: string;
}
export declare function createClient(opts: GlobalOpts): UgigClient;
export declare function createUnauthClient(opts: GlobalOpts): UgigClient;
export declare function handleError(err: unknown, opts: OutputOptions): void;
export declare function parseList(value: string | undefined): string[] | undefined;
