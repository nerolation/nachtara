/**
 * CLI display utilities for nice-looking output.
 */
import ora from 'ora';
import type { Address, Hex } from 'viem';
import type { NetworkConfig, OwnedStealthAddress } from '../lib/types.js';
export declare function startSpinner(text: string): ReturnType<typeof ora>;
export declare function stopSpinner(success?: boolean, text?: string): void;
export declare function updateSpinner(text: string): void;
export declare const symbols: {
    success: string;
    error: string;
    warning: string;
    info: string;
    arrow: string;
    key: string;
    wallet: string;
    network: string;
    send: string;
    receive: string;
    lock: string;
    unlock: string;
};
export declare function printHeader(text: string): void;
export declare function printSubheader(text: string): void;
export declare function printSuccess(text: string): void;
export declare function printError(text: string): void;
export declare function printWarning(text: string): void;
export declare function printInfo(text: string): void;
export declare function printKeyValue(key: string, value: string, indent?: number): void;
export declare function printAddress(label: string, address: Address, showUrl?: string): void;
export declare function printAmount(label: string, amountWei: bigint): void;
export declare function printTxHash(hash: Hex, explorerUrl?: string): void;
export declare function printWalletInfo(params: {
    address: Address;
    stealthMetaAddress: Hex;
    balance?: bigint;
    network?: NetworkConfig;
}): void;
export declare function printNetworkInfo(network: NetworkConfig): void;
export declare function printStealthAddresses(addresses: OwnedStealthAddress[]): void;
export declare function printSendSummary(params: {
    recipient: string;
    stealthAddress: Address;
    amount: string;
    network: NetworkConfig;
}): void;
export declare function printSecurityNotice(): void;
export declare function printRegistrationSuccess(params: {
    txHash: Hex;
    network: NetworkConfig;
}): void;
//# sourceMappingURL=display.d.ts.map