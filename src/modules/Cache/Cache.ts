import Dexie from 'dexie';
import objHash from 'object-hash';
import AlgoStack from '../../index.js';
import Options from '../../utils/options.js';
import { durationStringToMs } from '../../helpers/format.js';
import { CacheEntry } from './types.js';

/**
 * Cache module
 * ==================================================
 */
export default class Cache {
  protected options: Options;
  protected db: Dexie;
  protected v: number = 1;

  constructor(forwarded: AlgoStack) {
    this.options = forwarded.options;
    this.db = new Dexie(this.options.storageNamespace);
  }

  /**
   * Init DB
   * ==================================================
   */
  public init(forwarded: AlgoStack) {
    let stores: Record<string, string> = {}
    // Query module
    if (forwarded.query) {
      stores = { 
        ...stores, 
        // lookups
        account: '&id, [id+params]',
        accountTransactions: '&id, [id+params]',
        application: '&id, [id+params]',
        asset: '&id, [id+params]',
        assetBalances: '&id, [id+params]',
        assetTransactions: '&id, [id+params]',
        block: '&id, [id+params]',
        txn: '&id, [id+params]',
        // search
        applications: '&params',
        accounts: '&params',
        assets: '&params',
        txns: '&params',
      };
    }
    // Query Addons
    if (forwarded.queryAddons) {
      stores = { ...stores, icon: '&id' }
    }
    // NFDs
    if (forwarded.nfds) {
      stores = { ...stores, nfds: '&address, *nfds' };
    }
    
    // Init
    this.db.version(this.v).stores(stores);
  }  

  /**
   * Find an entry based on its ID and the query
   * ==================================================
   */
  public async find(store: string, query: CacheEntry) {
    if (!this.db[store]) return console.error(`Store not found (${store})`);  
    query = this.filterCacheEntry(query);
    try {
      const results = await this.db[store].get(query)
      if (!results) return;
      const expiration = this.getExpiration(store);
      const isExpired = results.timestamp + expiration < Date.now();
      if (isExpired) {
        console.warn(`[${store}] Cache entry has expired.`)
        return;
      }
      return results;
    }
    catch(e) {
      // console.log(store, e)
      return;
    };
  }


  /**
   * Save an entry
   * ==================================================
   */
  public async save(store: string, data: any, entry: CacheEntry) {
    if (!this.db[store]) return console.error(`Store not found (${store})`);
    entry = {
      ...this.filterCacheEntry(entry), 
      data, 
      timestamp: Date.now(),
    }
    try {
      await this.db[store].put(entry);
    }
    catch(e) {
      console.error(store, e)
    }
  }



  /**
   * Prepare cache entry
   * ==================================================
   */
  private filterCacheEntry (entry: CacheEntry = {}) {
    const result = entry;
    Object.entries(result)
      .forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value)) result[key] = objHash(value)
        if (value === null || value === undefined) delete result[key]; 
      });
    return result;
  }



  /**
   * Get Expiration or a store
   * ==================================================
   */
   private getExpiration(store: string) {
    const expirationStr = this.options.cacheExpiration[store] 
      || this.options.cacheExpiration.default;
    return durationStringToMs(expirationStr);
  }


}
