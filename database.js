const MongoClient = require("mongodb").MongoClient;
let dbconfig = require("./dbconfig");

assert = require("assert");
var Long = require("mongodb").Long;
let enableConsoleLog = false;

Date.prototype.toUnixTime = function() {
  return (this.getTime() / 1000) | 0;
};
Date.time = function() {
  return new Date().toUnixTime();
};


/*
_SKMNetUserWalletAddr       : input user Wallet in SKM chain
_SKMParkingWalletETH        : Parking wallet in Eth network associated to _SKMNetUserWalletAddr
_SKMParkingWalletETHPrivKey : Private key of _SKMParkingWalletETH

*/

/**
 * Inserts wallets in to Database returns true if no errors
 *
 * @param {string} _SKMNetUserWalletAddr        - Wallet address user entered
 * @param {string} _SKMParkingWalletETH         - Auto generated ETH network key
 * @param {string} _SKMParkingWalletETHPrivKey  - Auto generated ETH network key
 */
let insertIntoDB = function insertIntoDB(
  _SKMNetUserWalletAddr,
  _SKMParkingWalletETH,
  _SKMParkingWalletETHPrivKey
) {
  let returnVal = false;
  try {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      assert.equal(err, null);

      if (enableConsoleLog) console.log("Connected successfully to server");
      const db = client.db(dbconfig.databaseName);

      //Insert all keys to a database
      db.collection(dbconfig.dbKeysCollection).insertOne({
        SKMNetUserWalletAddr: _SKMNetUserWalletAddr,
        SKMParkingWalletETH: _SKMParkingWalletETH,
        SKMParkingWalletETHPrivKey: _SKMParkingWalletETHPrivKey
      });

      //Insert only public keys into table.
      db.collection(dbconfig.dbCollectionName).insertOne({
        SKMNetUserWalletAddr: _SKMNetUserWalletAddr,
        SKMParkingWalletETH: _SKMParkingWalletETH
      });
      returnVal = true;
      if (enableConsoleLog) console.log("inserted record");

      client.close();
    });
  } catch (err) {
    if (enableConsoleLog) console.log("Exception Occured. " + err);
    returnVal = false;
  }
  return returnVal;
};

/**
 * Functin used to search/ retrieve associated wallet mapping in SKM and ETH networks
 * returns the document (eth network to SKM network mapping addresses)
 * @param {string} _SearchWallet    -   wallet address to search
 * @param {string} isParkingWallet  -   is parking wallet in eth network or not
 */
let retriveAssociatedWallet = function retriveAssociatedWallet(
  _SearchWallet,
  isParkingWallet
) {
  return new Promise(function(resolve, reject) {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      if (err) {
        reject(err);
      } else {
        const db = client.db(dbconfig.databaseName);
        resolve(client);
      }
    });
  }).then(function(client) {
    return new Promise(function(resolve, reject) {
      const db = client.db(dbconfig.databaseName);

      var query;
      if (isParkingWallet) query = { SKMParkingWalletETH: _SearchWallet };
      else query = { SKMNetUserWalletAddr: _SearchWallet };

      db.collection(dbconfig.dbCollectionName).findOne(query, function(
        err,
        doc
      ) {
        client.close();
        if (err) {
          reject(err);
        } else {
          if (doc) {
            //doc.SKMParkingWalletETHPrivKey ='';
          }
          resolve(doc);
        }
        //client.close();
      });
    });
  });
};

/**
 * updates the transaction history of swap in 3 cases
 * 1. When eth transaction is confirmed after 'n' blocks
 * 2. When SKM coins are sent in mainnet
 * 3. When SKM coins transfer transaction  is confirmed after 'n' blocks
 *
 * @param {*} _ethTxHash       -    eth swap transaction
 * @param {bool} _confirmTx    -    wheather to cofirm transaction or insert transaction
 * @param {*} _MainnetTx       -    optional mainnet transaction address
 */
let updateTxHistory = function updateTxHistory(
  _ethTxHash,
  _confirmTx,
  _MainnetTx
) {
  return new Promise(function(resolve, reject) {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      if (err) {
        reject(err);
      } else {
        const db = client.db(dbconfig.databaseName);
        resolve(client);
      }
    });
  }).then(function(client) {
    return new Promise(function(resolve, reject) {
      const db = client.db(dbconfig.databaseName);

      var query = { ethTxHash: _ethTxHash };
      var update_value;

      let currentTime = Date.time().toString();

      if (_confirmTx) {
        if (_MainnetTx.length > 1)
          update_value = {
            $set: {
              mainnetTxHash: _MainnetTx,
              mainnetTxHashConfirmed: true,
              mainnetTxHashConfirmedTime: Long.fromString(currentTime)
            }
          };
        else
          update_value = {
            $set: {
              ethTxConfirmed: true,
              ethTxConfirmedTime: Long.fromString(currentTime)
            }
          };
      } else {
        if (_MainnetTx.length > 1)
          update_value = {
            $set: {
              mainnetTxHash: _MainnetTx,
              mainnetTxHashTime: Long.fromString(currentTime)
            }
          };
        else {
          update_value = {
            $set: { errors: "eth tx not found or missing" }
          };
        }
      }

      db.collection(dbconfig.dbTxCollection).findOneAndUpdate(
        query,
        update_value,
        function(err, doc) {
          client.close();
          if (err) {
            reject(err);
          } else {
            //console.log('Debug '+doc.SKMNetUserWalletAddr,' : ',doc.SKMParkingWallet);
            if (doc) {
              //doc.SKMParkingWalletETHPrivKey ='';
            }
            resolve(doc);
          }
          //client.close();
        }
      );
    });
  });
};

/**
 * Inserts the transaction into database, if the transaction is a token swap
 *
 * @param {*} _SKMParkingWalletETH
 * @param {*} _SKMNetUserWalletAddr
 * @param {*} _tokensReceived
 * @param {*} _ethTxhash
 */
let insertETHTrans = function insertETHTrans(
  _SKMParkingWalletETH,
  _SKMNetUserWalletAddr,
  _tokensReceived,
  _ethTxhash
) {
  let returnVal = "";
  try {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      assert.equal(err, null);

      if (enableConsoleLog) console.log("Connected successfully to server");
      const db = client.db(dbconfig.databaseName);

      let currentTime = Date.time().toString();
      //Insert
      db.collection(dbconfig.dbTxCollection).insertOne(
        {
          SKMParkingWalletETH: _SKMParkingWalletETH,
          SKMNetUserWalletAddr: _SKMNetUserWalletAddr,
          tokensReceived: _tokensReceived,
          ethTxHash: _ethTxhash,
          ethTxHashTime: Long.fromString(currentTime),
          ethTxConfirmed: false,
          ethTxConfirmedTime: "",
          mainnetTxHash: "",
          mainnetTxHashTime: "",
          mainnetTxHashConfirmed: false,
          mainnetTxHashConfirmedTime: "",
          errors: ""
        },
        (err, result) => {
          if (err) returnVal = -1;
          else returnVal = result.insertedId;
        }
      );
      if (enableConsoleLog) console.log("inserted record");

      client.close();
    });
  } catch (err) {
    if (enableConsoleLog) console.log("Exception Occured. " + err);
    returnVal = false;
  }
  return returnVal;
};

/**
 * Functin used to retrieve txs for which we need to send SKMs for delayed token bridge
 * returns the collection of documents
 * @param {string} _SearchWallet    -   wallet address to search
 * @param {string} isParkingWallet  -   is parking wallet in eth network or not
 */
let txsToProcess = function txsToProcess(sDateUntill, sDateFrom, limit) {
  return new Promise(function(resolve, reject) {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      if (err) {
        reject(err);
      } else {
        const db = client.db(dbconfig.databaseName);
        resolve(client);
      }
    });
  }).then(function(client) {
    return new Promise(function(resolve, reject) {
      const db = client.db(dbconfig.databaseName);

      var query = {
        ethTxConfirmedTime: {
          $gt: Long.fromString(sDateFrom),
          $lt: Long.fromString(sDateUntill)
        },
        mainnetTxHash: "",
        ethTxConfirmed: true
      };

      db.collection(dbconfig.dbTxCollection)
        .find(query)
        .limit(limit)
        .toArray(function(err, doc) {
          client.close();
          if (err) {
            reject(err);
          } else {

            if (doc) {
              //doc.SKMParkingWalletETHPrivKey ='';
            }
            resolve(doc);
          }
        });
    });
  });
};


/**
 * Functin used to check if a given eth wallet is in blacklisted list
 * returns the document (eth network to SKM network mapping addresses)
 * @param {string} _ethWalletAddress    -   ethereum wallet address to search
 */
let isWalletinBlackList = function isWalletinBlackList(
  _ethWalletAddress
) {
  return new Promise(function(resolve, reject) {
    MongoClient.connect(dbconfig.dbURL, { useNewUrlParser: true }, function(
      err,
      client
    ) {
      if (err) {
        reject(err);
      } else {
        const db = client.db(dbconfig.databaseName);
        resolve(client);
      }
    });
  }).then(function(client) {
    return new Promise(function(resolve, reject) {
      const db = client.db(dbconfig.databaseName);

      var query = { ethWallet: _ethWalletAddress };


      db.collection(dbconfig.dbWalletBlackList).findOne(query, function(
        err,
        doc
      ) {
        client.close();
        if (err) {
          reject(err);
        } else {
          if (doc) {
            resolve(true);
          }
          else resolve(false)
         
        }
      });
    });
  });
};


module.exports = {
  insertIntoDB: insertIntoDB,
  retriveAssociatedWallet: retriveAssociatedWallet,
  insertETHTrans: insertETHTrans,
  updateTxHistory: updateTxHistory,
  txsToProcess: txsToProcess,
  isWalletinBlackList: isWalletinBlackList
};
