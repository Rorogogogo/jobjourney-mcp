import * as signalR from "@microsoft/signalr";
export interface SignalRClientOptions {
    apiUrl: string;
    apiKey: string;
    dbPath?: string;
}
export declare function createSignalRClient(options: SignalRClientOptions): Promise<signalR.HubConnection>;
