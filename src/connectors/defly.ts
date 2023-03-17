
import { Transaction } from 'algosdk';
import { DeflyWalletConnect } from "@blockshake/defly-connect";
import BaseConnector from './base.js';

export default class Pera extends BaseConnector {
  protected connector?: DeflyWalletConnect = undefined;
  
  constructor() {
    super();
    if (typeof window === 'undefined') return;
    this.connector = new DeflyWalletConnect();
    const persistedWC = JSON.parse(localStorage.getItem('walletconnect') || '{}');
    if (persistedWC.connected) {
      this.connector.reconnectSession();
    }
  }

  //
  // Connect account
  // ----------------------------------------------
  public async connect (): Promise<string[]|undefined> {
    if (!this.connector) return undefined;
    
    // connect
    try {
      const addresses = await this.connector.connect();
      return addresses;
    } 
    catch {
      return undefined
    }
  }

  //
  // Connect account
  // ----------------------------------------------
  public async reconnect (): Promise<string[]|undefined> {
    if (!this.connector) return undefined;
    try {
      const addresses = await this.connector.reconnectSession();;
      return addresses;
    } 
    catch {
      return undefined;
  
    }
  }




  //
  // Sign transaction(s)
  // ----------------------------------------------
  public async sign(txns: Transaction[]): Promise<Uint8Array[]|undefined> { 
    if (!this.connector) return undefined;
    const unsignedTxns = txns.map(txn => ({ txn })); 
    try {
      const result = await this.connector.signTransaction([unsignedTxns]);
      const signedBytes = result.map(arr => Uint8Array.from(arr));
      return signedBytes;
    } catch (e){
      console.error(e)
      return undefined;
    }
  };

  //
  // Disconnect
  // ----------------------------------------------
  disconnect() {
    if (!this.connector) return;
    this.connector.disconnect();
  }
}