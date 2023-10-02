import { durationStringToMs } from '../../helpers/format.js';
import { CacheConfigs, CacheEntry, CacheQuery } from './types.js';
import { BaseModule } from '../_baseModule.js';
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import Dexie, { DexieError } from 'dexie';
import objHash from 'object-hash';
import AlgoStack from '../../index.js';
import merge from 'lodash-es/merge.js';


/**
 * Cache module
 * ==================================================
 */
export default class Cache extends BaseModule {
  protected db: Dexie;
  protected v: number = 1;
  protected configs: CacheConfigs;

  constructor(configs: CacheConfigs = {}) {
    super();
    this.configs = merge({
      namespace: 'algostack',
      stores: undefined,
      logExpiration: false,
      expiration: {
        'default': '1h',
        'indexer/asset': '1w',
        'indexer/assetBalances': '2s',
        'indexer/assetTransactions': '2s',
        'indexer/assets': '5m',
        'indexer/block': '1w',
        'indexer/transaction': '1w',
        'node/account': '10s',
        'node/teal': '6h',
        'nfd/lookup': '1h',
        'nfd/search': '1m',
        'addons/icon': '1d',
        'medias/asset': '1d',
      },
    }, configs);

    this.db = new Dexie(
      this.configs.namespace, 
      typeof window !== 'undefined' && window.indexedDB 
        ? undefined
        : { indexedDB, IDBKeyRange }
      );
  }


  public init(stack: AlgoStack) {
    super.init(stack);
    this.v = stack.configs.version; 
    let stores: Record<string, string> = {}
    // Query module
    if (stack.query) {
      stores = { 
        ...stores, 
        // indexer
        'indexer/account': '&params',
        'indexer/accountAssets': '&params',
        'indexer/accountApplications': '&params',
        'indexer/accountTransactions': '&params',
        'indexer/application': '&params',
        'indexer/applicationBox': '&params',
        'indexer/applicationBoxes': '&params',
        'indexer/asset': '&params',
        'indexer/assetBalances': '&params',
        'indexer/assetTransactions': '&params',
        'indexer/block': '&params',
        'indexer/txn': '&params',

        // node
        'node/account': '&params',
        'node/accountApplication': '&params',
        'node/accountAsset': '&params',
        'node/block': '&params',
        'node/blockProof': '&params',
        'node/blockTransactionProof': '&params',
        'node/teal': '&params',

        // search
        'indexer/applications': '&params',
        'indexer/accounts': '&params',
        'indexer/assets': '&params',
        'indexer/txns': '&params',
      };
    }
    // NFDs
    if (stack.nfds) {
      stores = { 
        ...stores, 
        'nfd/lookup': '&address, nfd',
        'nfd/search': '&params', 
      };
    }
    // Medias
    if (stack.medias) {
      stores = { 
        ...stores, 
        'medias/asset': '&id' 
      };
    }
    if (this.configs.stores?.length) {
      const extraStores: Record<string, string> = {} 
      this.configs.stores.forEach(store => {
        if (typeof store === 'string') extraStores[store] = '&params';
        else extraStores[store.name] = store.index || '&params';
      });
      stores = {
        ...extraStores,
        ...stores,
      }
    }
    
    // Init
    this.db.version(this.v).stores(stores);    
    return this;
  }  



  /**
  * Find an entry based on its ID and the query
  * ==================================================
  */


  public async find<Q extends CacheQuery>(store: string, query: Q): Promise<
    Q extends { limit: number }
      ? CacheEntry[]|undefined
      : CacheEntry|undefined
  > {
    let table = this.db[store];
    if (!table) {
      console.error(`Store not found (${store})`);
      return undefined;
    }
    
    if (query.orderBy) table = table.orderBy(query.orderBy);
    if (query.order && ['desc', 'DESC'].includes(query.order)) table = table.desc();
    if (query.where) table = table.where( this.hashObjectProps(query.where) );
    if (query.filter) table = table.filter( query.filter );
    if (!query.includeExpired) table = table.filter( (entry: CacheEntry) => !this.isExpired(store, entry));
    
    //
    // Return a single entry object
    // if no limit param is defined 
    // Default behavior
    // --------------------------------------------------
    if (query.limit === undefined) return await table.first();

    //
    // Find multiple entries
    // --------------------------------------------------    
    return await table.limit(query.limit).toArray();
  }


  /**
  * Save an entry
  * ==================================================
  */
  public async save(store: string, data: any, entry: CacheEntry) {
    if (!this.db[store]) return console.error(`Store not found (${store})`);
    entry = {
      ...this.hashObjectProps(entry), 
      data, 
      timestamp: Date.now(),
    }
    try {
      await this.db[store].put(entry);
    }
    catch(e) {
      await this.handleError(e, store);
    }
  }



  /**
  * Prepare cache entry
  * ==================================================
  */
  private hashObjectProps (entry: CacheEntry = {}) {
    if (typeof entry !== 'object') return entry;
    const result = entry;
    Object.entries(result)
      .forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value)){
          result[key] = objHash(value)
        }
        if (value === null || value === undefined) delete result[key]; 
      });
    return result;
  }
  



  /**
  * Expiration
  * ==================================================
  */
  public isExpired(store: string, entry: CacheEntry) {
    const expiration = this.getExpiration(store);
    const isExpired = entry.timestamp + expiration < Date.now();
    if ( isExpired && this.configs.logExpiration) 
      console.warn(`[${store}] Cache entry has expired.`)
    return isExpired;
  }

  private getExpiration(store: string) {
    const expirationStr = this.configs.expiration[store] 
      || this.configs.expiration.default;
    return durationStringToMs(expirationStr);
  }


  /**
  * Error handler
  * ==================================================
  */
  private async handleError(error: DexieError, store?: string) {
    const names: string[] = [error.name];
    if (error.inner?.name) names.push(error.inner.name);

    if (names.includes(Dexie.errnames.Upgrade)) {
      console.warn('An error occured while upgrading IndexedDB tables. Clearing IndexedDB Cache.');
      await this.clearAll();
    }
  }


  /**
  * Reset
  * ==================================================
  */
  private async clearAll() {
    await this.db.delete();
  }

  /**
  * Prune
  * ==================================================
  */
  public async prune(stores?: string|string[]) {
    const pruned = {}; 
    if (stores === undefined) stores = this.db.tables.map(table => table.name);
    else if (typeof stores === 'string') stores = [stores];
    for (let i=0; i<stores.length; i++) {
      const store = stores[i]
      const table = this.db[store];
      const expirationLimit = Date.now() - this.getExpiration(store);
      const expired = await table
        .filter(entry => entry.timestamp < expirationLimit)
        .delete();
      if (expired) pruned[store] = expired;
    }
    return pruned;
  }

}

