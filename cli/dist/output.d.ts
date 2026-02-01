export interface OutputOptions {
    json: boolean;
}
export interface ColumnDef {
    header: string;
    key: string;
    width?: number;
    transform?: (value: unknown, row: Record<string, unknown>) => string;
}
export interface FieldDef {
    label: string;
    key: string;
    transform?: (value: unknown) => string;
}
export declare function printTable(columns: ColumnDef[], rows: Record<string, unknown>[], options: OutputOptions, pagination?: {
    page: number;
    total: number;
    totalPages?: number;
    limit?: number;
}): void;
export declare function printDetail(fields: FieldDef[], data: Record<string, unknown>, options: OutputOptions): void;
export declare function printSuccess(message: string, options: OutputOptions): void;
export declare function printError(message: string, options: OutputOptions): void;
export declare function truncateId(value: unknown): string;
export declare function truncate(maxLen: number): (value: unknown) => string;
export declare function formatBudget(_: unknown, row: Record<string, unknown>): string;
export declare function colorizeStatus(value: unknown): string;
export declare function relativeDate(value: unknown): string;
export declare function formatDate(value: unknown): string;
export declare function formatArray(value: unknown): string;
