/**
 * Receive command - scan for incoming stealth payments.
 */
import type { OwnedStealthAddress } from '../lib/types.js';
export declare function receiveCommand(options: {
    full?: boolean;
    fromBlock?: string;
}): Promise<void>;
export declare function balanceCommand(): Promise<void>;
export declare function getDiscoveredAddresses(): OwnedStealthAddress[];
//# sourceMappingURL=receive.d.ts.map