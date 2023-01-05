import algosdk, { Transaction, Account } from 'algosdk';
import BaseConnector from './base.js';

export default class MyAlgo extends BaseConnector {
  protected connector?: any = {};
  private account: Account;
  public ready: boolean = false;
  constructor(mnemonic?: string) {
    super();
    if (!mnemonic) {
      this.ready = undefined;
      return; 
    } 
    // Warn if used on the client side
    if (typeof window !== 'undefined') {
      console.warn(`You shouldn't use mnemonic connection on the frontend.`);
    };

    // try to convert the mnemonic as an account
    try {
      this.account = algosdk.mnemonicToSecretKey(mnemonic);
      this.ready = true;
    } catch (e) {
      this.ready = undefined;
    }
  }


  //
  // Sign transaction(s)
  // ----------------------------------------------
  public async sign(txns: Transaction[]): Promise<Uint8Array[]|undefined> { 
    if (!this.connector) return undefined;
    try {
      const signedTxns = txns.map(txn => txn.signTxn(this.account.sk));
      return signedTxns;
    } catch(err) {
      console.log(err);
      return undefined;
    }
  };
}